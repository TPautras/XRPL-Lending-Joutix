import { useEffect, useRef, useState } from 'react'
import { Client } from 'xrpl'
import { NETWORK } from '../wallet/config'
import { amount, clock, rippleNow, TICKER } from '../lib/format'

/** Mirrors src/protocol/lib/state.ts's HackathonState — written to public/state.json
 * by the protocol scripts, polled here since it may not exist yet when this app
 * starts and Vite can't statically import a file that doesn't exist at build time. */
interface HackathonState {
  mptIssuanceId?: string
  domainId?: string
  vault?: { vaultId: string; shareMptId: string; private: boolean }
  loanBrokerId?: string
  loans: {
    A?: { loanId: string; paymentInterval: number; gracePeriod: number; startDate: number }
    B?: { loanId: string; paymentInterval: number; gracePeriod: number; startDate: number }
  }
  insurance?: {
    owner: string
    destination: string
    offerSequence: number
    amount: string
    cancelAfter: number
    released?: boolean
    cancelled?: boolean
  }
}

/** All amounts below are raw TFEUR base units, exactly as the ledger returns them.
 * Scaling for display happens once, in lib/format.ts, at the render edge. */
export interface VaultView {
  vaultId: string
  shareMptId: string
  private: boolean
  assetsTotal: number
  assetsAvailable: number
  assetsDeployed: number
  lossUnrealized: number
  outstandingShares: number
  /** AssetsTotal / OutstandingAmount — a ratio of two base-unit counts, already scale-free. */
  sharePrice: number
}

export interface BrokerView {
  brokerId: string
  /** The broker's pseudo-account — every Loan it owns hangs off this directory. */
  pseudoAccount: string
  debtTotal: number
  coverAvailable: number
  /** 1/10th of a basis point: 10000 = 10.0%. */
  coverRateMinimum: number
  coverRequired: number
  /** coverAvailable / coverRequired. Infinity when there is no debt to cover. */
  coverRatio: number
  short: boolean
}

export type LoanStatus = 'active' | 'impaired' | 'defaulted' | 'repaid'

export interface LoanView {
  /** 'A'/'B' when state.json tracks it; null for a loan that only the ledger knows about. */
  slot: 'A' | 'B' | null
  loanId: string
  borrower: string
  status: LoanStatus
  /** Past its next payment date but not yet impaired — the window s9 waits out. */
  overdue: boolean
  principalOutstanding: number
  totalValueOutstanding: number
  periodicPayment: number
  paymentRemaining: number
  nextPaymentDueDate: number
  /** Ripple time at which `LoanManage tfLoanDefault` stops returning tecTOO_SOON. */
  defaultableAt: number | null
}

export type InsuranceStatus = 'locked' | 'released' | 'expired' | 'gone'

export interface InsuranceView {
  status: InsuranceStatus
  amount: number
  owner: string
  destination: string
  cancelAfter: number
  /** Whether the Escrow ledger object is still there — the ledger's answer, not state.json's. */
  onLedger: boolean
}

export interface FeedEvent {
  ts: string
  text: string
  kind: 'info' | 'good' | 'bad' | 'warn'
}

export interface DashboardView {
  connected: boolean
  ledgerIndex: number | null
  lastUpdate: string | null
  hasState: boolean
  vault: VaultView | null
  broker: BrokerView | null
  loans: Record<'A' | 'B', LoanView | null>
  /** Loans the broker owns that state.json does not track — leftovers from earlier runs,
   * the gate probes, and anything a teammate originated. They are counted in DebtTotal,
   * so leaving them off the screen makes the reserve's own figures look invented. */
  otherLoans: LoanView[]
  /** Sum of every outstanding loan the broker owns, to check against DebtTotal. */
  loansOutstanding: number
  insurance: InsuranceView | null
  events: FeedEvent[]
}

const LOAN_DEFAULT_FLAG = 0x00010000
const LOAN_IMPAIRED_FLAG = 0x00020000

const EMPTY_VIEW: DashboardView = {
  connected: false,
  ledgerIndex: null,
  lastUpdate: null,
  hasState: false,
  vault: null,
  broker: null,
  loans: { A: null, B: null },
  otherLoans: [],
  loansOutstanding: 0,
  insurance: null,
  events: [],
}

/** What the previous refresh saw, so the feed can report changes instead of heartbeats. */
interface Snapshot {
  sharePrice: number
  lossUnrealized: number
  assetsTotal: number
  coverAvailable: number
  debtTotal: number
  loans: Record<'A' | 'B', LoanStatus | null>
  insurance: InsuranceStatus | null
}

function num(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Read-only view of the whole TrustFlow demo: RPC queries against the hackathon devnet
 * plus the object ids the protocol scripts wrote to public/state.json. Never signs or
 * submits anything — see CLAUDE.md, "the webapp is read-only". */
export function useDashboard(): DashboardView {
  const [view, setView] = useState<DashboardView>(EMPTY_VIEW)
  // Held in a ref rather than state: the diffing must not itself trigger a render.
  const previous = useRef<Snapshot | null>(null)

  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    let stateJson: HackathonState | null = null
    let refreshing = false
    const client = new Client(NETWORK.wss)

    function emit(events: FeedEvent[], text: string, kind: FeedEvent['kind'] = 'info') {
      events.push({ ts: clock(new Date()), text, kind })
    }

    function push(lines: FeedEvent[]) {
      if (!lines.length || cancelled) return
      setView((prev) => ({ ...prev, events: [...lines.reverse(), ...prev.events].slice(0, 40) }))
    }

    async function entry(index: string): Promise<Record<string, unknown> | null> {
      try {
        const { result } = await client.request({
          command: 'ledger_entry',
          index,
          ledger_index: 'validated',
        } as never)
        return (result as { node: Record<string, unknown> }).node
      } catch {
        // Not created yet, or a transient RPC hiccup — the next refresh retries.
        return null
      }
    }

    async function readVault(s: HackathonState): Promise<VaultView | null> {
      if (!s.vault) return null
      try {
        const { result } = await client.request({
          command: 'vault_info',
          vault_id: s.vault.vaultId,
        } as never)
        const v = (result as { vault: Record<string, unknown> }).vault
        const assetsTotal = num(v.AssetsTotal)
        const assetsAvailable = num(v.AssetsAvailable)
        const shares = num((v.shares as { OutstandingAmount?: string } | undefined)?.OutstandingAmount)
        return {
          vaultId: s.vault.vaultId,
          shareMptId: s.vault.shareMptId,
          private: s.vault.private,
          assetsTotal,
          assetsAvailable,
          // What the vault has lent out and cannot pay a withdrawal from — the number
          // behind s7's deliberate tecINSUFFICIENT_FUNDS.
          assetsDeployed: assetsTotal - assetsAvailable,
          // Absent from the object entirely while zero, which is why `num` defaults it.
          lossUnrealized: num(v.LossUnrealized),
          outstandingShares: shares,
          sharePrice: shares > 0 ? assetsTotal / shares : 0,
        }
      } catch {
        return null
      }
    }

    async function readBroker(s: HackathonState): Promise<BrokerView | null> {
      if (!s.loanBrokerId) return null
      const node = await entry(s.loanBrokerId)
      if (!node) return null
      const debtTotal = num(node.DebtTotal)
      const coverAvailable = num(node.CoverAvailable)
      const coverRateMinimum = num(node.CoverRateMinimum)
      // Rates are 1/10th bps, so the fraction is rate / 100000 (10000 -> 0.10).
      const coverRequired = (debtTotal * coverRateMinimum) / 100000
      return {
        brokerId: s.loanBrokerId,
        pseudoAccount: String(node.Account ?? ''),
        debtTotal,
        coverAvailable,
        coverRateMinimum,
        coverRequired,
        coverRatio: coverRequired > 0 ? coverAvailable / coverRequired : Infinity,
        short: coverRequired > 0 && coverAvailable < coverRequired,
      }
    }

    /**
     * Every Loan the broker owns, read from its pseudo-account directory rather than
     * from the two ids in state.json.
     *
     * DebtTotal counts all of them, so a two-slot view cannot be reconciled against the
     * reserve's own figures: the devnet currently carries loans from earlier runs and
     * from the gate probes that state.json never knew about. Showing four fifths of the
     * debt with no matching rows reads as invented numbers, which is worse than clutter.
     */
    async function readLoans(s: HackathonState, broker: BrokerView | null): Promise<LoanView[]> {
      if (!broker?.pseudoAccount) return []
      try {
        const { result } = await client.request({
          command: 'account_objects',
          account: broker.pseudoAccount,
          type: 'loan',
          ledger_index: 'validated',
          limit: 400,
        } as never)
        const objects = (result as { account_objects: Array<Record<string, unknown>> }).account_objects
        const bySlot = new Map<string, 'A' | 'B'>()
        for (const slot of ['A', 'B'] as const) {
          const id = s.loans[slot]?.loanId
          if (id) bySlot.set(id, slot)
        }
        return objects.map((node) => toLoanView(node, bySlot.get(String(node.index)) ?? null))
      } catch {
        return []
      }
    }

    function toLoanView(node: Record<string, unknown>, slot: 'A' | 'B' | null): LoanView {
      const flags = num(node.Flags)
      // A fully repaid loan keeps its Loan object, but the ledger clears
      // PrincipalOutstanding / TotalValueOutstanding / PaymentRemaining /
      // NextPaymentDueDate and leaves PreviousPaymentDueDate behind. Without this the
      // card reads "Active — 0.00 TFEUR, 0 payments left", which is exactly wrong on stage.
      const repaid = node.PrincipalOutstanding === undefined && node.PreviousPaymentDueDate !== undefined

      const status: LoanStatus =
        flags & LOAN_DEFAULT_FLAG
          ? 'defaulted'
          : flags & LOAN_IMPAIRED_FLAG
            ? 'impaired'
            : repaid
              ? 'repaid'
              : 'active'

      const nextPaymentDueDate = num(node.NextPaymentDueDate)
      const gracePeriod = num(node.GracePeriod)

      return {
        slot,
        loanId: String(node.index ?? ''),
        borrower: String(node.Borrower ?? ''),
        status,
        overdue: status === 'active' && nextPaymentDueDate > 0 && rippleNow() > nextPaymentDueDate,
        principalOutstanding: num(node.PrincipalOutstanding),
        totalValueOutstanding: num(node.TotalValueOutstanding),
        periodicPayment: num(node.PeriodicPayment),
        paymentRemaining: num(node.PaymentRemaining),
        nextPaymentDueDate,
        // XLS-66: tfLoanDefault is tecTOO_SOON until now > NextPaymentDueDate + GracePeriod.
        defaultableAt: nextPaymentDueDate > 0 ? nextPaymentDueDate + gracePeriod : null,
      }
    }

    /** The escrow's real state comes from the ledger; state.json only explains an absence. */
    async function readInsurance(s: HackathonState): Promise<InsuranceView | null> {
      const ins = s.insurance
      if (!ins) return null

      let onLedger = false
      try {
        const { result } = await client.request({
          command: 'account_objects',
          account: ins.owner,
          type: 'escrow',
          ledger_index: 'validated',
        } as never)
        const objects = (result as { account_objects: Array<Record<string, unknown>> }).account_objects
        onLedger = objects.some((o) => num(o.Sequence) === ins.offerSequence)
      } catch {
        // Fall through to the state.json reading rather than claiming it is gone.
        onLedger = !ins.released && !ins.cancelled
      }

      const status: InsuranceStatus = onLedger
        ? 'locked'
        : ins.released
          ? 'released'
          : ins.cancelled
            ? 'expired'
            : 'gone'

      return {
        status,
        amount: num(ins.amount),
        owner: ins.owner,
        destination: ins.destination,
        cancelAfter: ins.cancelAfter,
        onLedger,
      }
    }

    /**
     * Compare against the last refresh and turn the differences into feed lines.
     *
     * The first successful read is a silent baseline: without that, every value would
     * be announced as a change from zero the moment the page loads. A read that came
     * back empty (not connected yet, or an RPC hiccup) is not a baseline at all — it is
     * discarded, or the next good read would report the whole reserve as "restored".
     */
    function diff(next: Snapshot, complete: boolean, lines: FeedEvent[]) {
      if (!complete) return
      const prev = previous.current
      previous.current = next
      if (!prev) return

      if (next.sharePrice !== prev.sharePrice) {
        const up = next.sharePrice > prev.sharePrice
        emit(
          lines,
          `Share price ${up ? 'up' : 'down'} ${prev.sharePrice.toFixed(6)} → ${next.sharePrice.toFixed(6)}`,
          up ? 'good' : 'bad',
        )
      }
      if (next.lossUnrealized !== prev.lossUnrealized) {
        emit(lines, `Unrealized loss ${amount(prev.lossUnrealized)} → ${amount(next.lossUnrealized)} ${TICKER}`, 'bad')
      }
      if (next.assetsTotal !== prev.assetsTotal) {
        emit(lines, `Reserve assets ${amount(prev.assetsTotal)} → ${amount(next.assetsTotal)} ${TICKER}`, 'info')
      }
      if (next.coverAvailable !== prev.coverAvailable) {
        const drained = next.coverAvailable < prev.coverAvailable
        emit(
          lines,
          `Manager cover ${amount(prev.coverAvailable)} → ${amount(next.coverAvailable)} ${TICKER}${drained ? ' — absorbing the loss' : ''}`,
          drained ? 'warn' : 'good',
        )
      }
      if (next.debtTotal !== prev.debtTotal) {
        emit(lines, `Broker debt ${amount(prev.debtTotal)} → ${amount(next.debtTotal)} ${TICKER}`, 'info')
      }
      for (const slot of ['A', 'B'] as const) {
        if (next.loans[slot] !== prev.loans[slot] && next.loans[slot]) {
          const status = next.loans[slot]
          emit(
            lines,
            `Loan ${slot} → ${status}`,
            status === 'defaulted' ? 'bad' : status === 'impaired' ? 'warn' : 'good',
          )
        }
      }
      if (next.insurance !== prev.insurance && next.insurance) {
        emit(
          lines,
          `Credit insurance → ${next.insurance}`,
          next.insurance === 'released' ? 'good' : next.insurance === 'locked' ? 'info' : 'warn',
        )
      }
    }

    async function refresh() {
      if (cancelled || !stateJson || refreshing) return
      refreshing = true
      try {
        const s = stateJson
        const [vault, broker, insurance] = await Promise.all([
          readVault(s),
          readBroker(s),
          readInsurance(s),
        ])
        // Depends on the broker's pseudo-account, so it cannot join the batch above.
        const allLoans = await readLoans(s, broker)
        if (cancelled) return

        const loanA = allLoans.find((l) => l.slot === 'A') ?? null
        const loanB = allLoans.find((l) => l.slot === 'B') ?? null
        const otherLoans = allLoans.filter((l) => l.slot === null)
        const loansOutstanding = allLoans.reduce((sum, l) => sum + l.principalOutstanding, 0)

        const lines: FeedEvent[] = []
        diff(
          {
            sharePrice: vault?.sharePrice ?? 0,
            lossUnrealized: vault?.lossUnrealized ?? 0,
            assetsTotal: vault?.assetsTotal ?? 0,
            coverAvailable: broker?.coverAvailable ?? 0,
            debtTotal: broker?.debtTotal ?? 0,
            loans: { A: loanA?.status ?? null, B: loanB?.status ?? null },
            insurance: insurance?.status ?? null,
          },
          // A read is only worth comparing when the objects that exist in state.json
          // actually came back — otherwise it is a snapshot of a disconnected client.
          Boolean(vault) && Boolean(broker),
          lines,
        )

        setView((prev) => ({
          ...prev,
          hasState: Boolean(s.vault),
          lastUpdate: clock(new Date()),
          vault,
          broker,
          loans: { A: loanA, B: loanB },
          otherLoans,
          loansOutstanding,
          insurance,
          events: lines.length ? [...lines.reverse(), ...prev.events].slice(0, 40) : prev.events,
        }))
      } finally {
        refreshing = false
      }
    }

    async function pollState() {
      try {
        const res = await fetch('/state.json', { cache: 'no-store' })
        if (res.ok) {
          stateJson = (await res.json()) as HackathonState
          await refresh()
        }
      } catch {
        // public/state.json doesn't exist until `npm run demo setup` has run once
      }
      if (!cancelled) pollTimer = setTimeout(pollState, 5000)
    }

    async function connect() {
      try {
        await client.connect()
        if (cancelled) return
        setView((prev) => ({ ...prev, connected: true }))
        push([{ ts: clock(new Date()), text: `Connected to ${NETWORK.name}`, kind: 'good' }])
        await client.request({ command: 'subscribe', streams: ['ledger'] } as never)
        client.on('ledgerClosed', (ledger: unknown) => {
          const index = Number((ledger as { ledger_index?: number }).ledger_index ?? 0)
          // The ledger index is a heartbeat, not news: it goes in the header, not the
          // feed, so a real event during the default trigger isn't buried under closes.
          setView((prev) => ({ ...prev, ledgerIndex: index }))
          void refresh()
        })
        client.on('disconnected', () => {
          if (cancelled) return
          setView((prev) => ({ ...prev, connected: false }))
          push([{ ts: clock(new Date()), text: 'Disconnected — retrying', kind: 'warn' }])
        })
      } catch (err) {
        if (!cancelled) {
          push([{ ts: clock(new Date()), text: `Connection failed: ${String(err)}`, kind: 'bad' }])
        }
      }
    }

    void connect()
    void pollState()

    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
      void client.disconnect()
    }
  }, [])

  return view
}
