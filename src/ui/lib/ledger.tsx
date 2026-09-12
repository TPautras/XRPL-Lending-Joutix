import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Client } from 'xrpl'
import { NETWORK } from './network'

export type LedgerStatus = 'connecting' | 'online' | 'offline'

export interface LedgerEvent {
  ts: string
  text: string
}

interface LedgerValue {
  client: Client
  status: LedgerStatus
  ledgerIndex: number | null
  /** `close_time` of the last validated ledger, in Ripple-epoch seconds. Loan and escrow
   * deadlines (`NextPaymentDueDate`, `CancelAfter`) are in that same epoch and must be
   * compared against ledger time, never wall-clock `Date.now()`. */
  ledgerTime: number | null
  /** Bumped on every validated ledger close. Pages use it as a refetch trigger, so a
   * screen is never more than one ledger (~4s) behind what the demo just did. */
  tick: number
  events: LedgerEvent[]
  lastError: string | null
}

const LedgerContext = createContext<LedgerValue | undefined>(undefined)

const MAX_EVENTS = 24
const MAX_BACKOFF_MS = 15_000

/**
 * One WebSocket for the whole app, read-only by construction: this provider and the pages
 * under it only ever call `client.request()`. Nothing here signs or submits — the browser
 * holds no key (CLAUDE.md "The webapp"), every TrustFlow transaction is signed by
 * `src/protocol/` with seeds from `.env`.
 *
 * Two reasons it lives above the router rather than inside a page: switching screens
 * mid-pitch must not drop the subscription and re-handshake, and a devnet that hiccups
 * during the demo should reconnect on its own. `subscribe` is re-sent after every
 * successful connect, because a subscription does not survive the socket that carried it.
 */
export function LedgerProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new Client(NETWORK.wss, { connectionTimeout: 10_000 }))
  const [status, setStatus] = useState<LedgerStatus>('connecting')
  const [ledgerIndex, setLedgerIndex] = useState<number | null>(null)
  const [ledgerTime, setLedgerTime] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const [events, setEvents] = useState<LedgerEvent[]>([])
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const push = (text: string) =>
      setEvents((prev) => [{ ts: new Date().toISOString(), text }, ...prev].slice(0, MAX_EVENTS))

    const onLedgerClosed = (ledger: unknown) => {
      const closed = ledger as { ledger_index?: number; ledger_time?: number }
      const index = Number(closed.ledger_index ?? 0)
      setLedgerIndex(index)
      if (typeof closed.ledger_time === 'number') setLedgerTime(closed.ledger_time)
      setTick((n) => n + 1)
      push(`Ledger ${index} closed`)
    }

    const onDisconnected = (code: number) => {
      if (cancelled) return
      setStatus('offline')
      push(`Disconnected (code ${code}) — retrying`)
      timer = setTimeout(() => void connect(), 1000)
    }

    const onError = (...args: unknown[]) => {
      setLastError(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '))
    }

    async function connect(): Promise<void> {
      if (cancelled || client.isConnected()) return
      setStatus('connecting')
      try {
        await client.connect()
        if (cancelled) return
        attempts = 0
        setStatus('online')
        setLastError(null)
        // The client no longer subscribes to ledger closes on its own, and a reconnect
        // starts from nothing — so this has to be re-sent on every successful connect.
        await client.request({ command: 'subscribe', streams: ['ledger'] })
        push(`Connected to ${NETWORK.name}`)
      } catch (err) {
        if (cancelled) return
        setStatus('offline')
        setLastError(err instanceof Error ? err.message : String(err))
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 1.5 ** attempts++)
        push(`Connection failed — retrying in ${Math.round(delay / 1000)}s`)
        timer = setTimeout(() => void connect(), delay)
      }
    }

    client.on('ledgerClosed', onLedgerClosed)
    client.on('disconnected', onDisconnected)
    client.on('error', onError)
    void connect()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      client.off('ledgerClosed', onLedgerClosed)
      client.off('disconnected', onDisconnected)
      client.off('error', onError)
      void client.disconnect()
    }
  }, [client])

  const value = useMemo(
    () => ({ client, status, ledgerIndex, ledgerTime, tick, events, lastError }),
    [client, status, ledgerIndex, ledgerTime, tick, events, lastError],
  )

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useLedger(): LedgerValue {
  const context = useContext(LedgerContext)
  if (!context) throw new Error('useLedger must be used within a LedgerProvider')
  return context
}

export interface LedgerQuery<T> {
  data: T | null
  error: string | null
  loading: boolean
}

/**
 * Runs `loader` against the shared connection once the socket is up, then again on every
 * ledger close and whenever `deps` change. `loader` is read through a ref so callers can
 * pass a fresh closure each render without re-triggering the effect — `deps` alone decides
 * when the query is stale. Pass `null` to stand down (e.g. an object ID not known yet).
 */
export function useLedgerQuery<T>(
  loader: ((client: Client) => Promise<T>) | null,
  deps: ReadonlyArray<unknown>,
  /** `refreshEveryTicks: 4` re-runs roughly every fourth ledger close instead of every
   * one — for screens that fan out into a dozen requests per pass and are not what the
   * audience is watching move. */
  opts: { refreshEveryTicks?: number } = {},
): LedgerQuery<T> {
  const { client, status, tick } = useLedger()
  const gatedTick = Math.floor(tick / Math.max(1, opts.refreshEveryTicks ?? 1))
  const [state, setState] = useState<LedgerQuery<T>>({ data: null, error: null, loading: true })
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    const current = loaderRef.current
    if (!current) {
      setState({ data: null, error: null, loading: false })
      return
    }
    if (status !== 'online') {
      setState((prev) => ({ ...prev, loading: prev.data === null }))
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const data = await current(client)
        if (!cancelled) setState({ data, error: null, loading: false })
      } catch (err) {
        // Keep the last good data on screen: a transient RPC hiccup should not blank a
        // panel mid-demo, and the next ledger close retries anyway.
        if (!cancelled) {
          setState((prev) => ({
            data: prev.data,
            error: err instanceof Error ? err.message : String(err),
            loading: false,
          }))
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, status, gatedTick, ...deps])

  return state
}
