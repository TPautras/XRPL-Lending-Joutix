import { useEffect, useState } from 'react'

export interface LoanState {
  loanId: string
  loanBrokerId: string
  paymentInterval: number
  gracePeriod: number
  startDate: number
}

export interface EscrowState {
  owner: string // insurer address — EscrowFinish/EscrowCancel's `Owner`
  offerSequence: number
  condition: string
  fulfillment: string
  cancelAfter: number
  destination: string // investorA address
  amount: string
  released?: boolean
  cancelled?: boolean
}

/**
 * One published crypto-condition the open protection market writes policies against.
 *
 * Anyone can create an `EscrowCreate` bearing `condition`; every escrow that carries it
 * is released by the same `fulfillment`, so revealing it settles every policy written on
 * that loan at once. That is the intended semantics — one default, all policies pay —
 * and it is also the whole trust assumption: see `publicView()`-equivalent redaction (the
 * script that used to strip this before publishing `public/state.json` is gone; whatever
 * writes that file now must keep withholding an unrevealed `fulfillment` the same way).
 */
export interface MarketCondition {
  /** Which loan in `loans` a payout refers to. */
  loan: string
  condition: string
  /** The secret. Withheld from `public/state.json` until `revealed`. */
  fulfillment: string
  /** Set once the referee has recorded a real default on `loan` and published the
   * fulfillment. From that moment any holder of a matching escrow can claim it. */
  revealed?: boolean
  revealedAt?: string
  createdAt: string
}

/** One row of the Phase 2 access matrix. */
export interface GateObservationRecord {
  state: string
  action: string
  result: string
  hash: string
  note?: string
}

/**
 * The shape of `public/state.json` — this app's other data source besides live RPC (see
 * CLAUDE.md's "two data sources, no third"). Whatever process produces that file is
 * responsible for matching this shape; nothing here touches `node:fs` or runs outside
 * the browser.
 */
export interface HackathonState {
  mptIssuanceId?: string
  credentialType?: string
  domainId?: string
  vault?: { vaultId: string; shareMptId: string; private: boolean }
  loanBrokerId?: string
  loans: { A?: LoanState; B?: LoanState }
  insurance?: EscrowState
  /** The open protection market: the referee's address and the conditions anyone may
   * write a policy against. */
  market?: { referee: string; conditions: MarketCondition[] }
  /** role name -> classic address, so the Gate page can read each participant's
   * credential state straight off the ledger without the browser needing `.env` access. */
  accounts?: Record<string, string>
  /** The four-state credential walk plus the borrow-side probe, so the Gate page renders
   * real hashes instead of a table retyped by hand. */
  gate?: { ts: string; observations: GateObservationRecord[] }
  /** The manager's XLS-47 Price Oracle valuing the receivable currently financed.
   * Informational only: `LoanSet`/`LoanManage` consult no `Oracle` object, so nothing
   * here feeds back into loan-to-value or cover math. */
  oracle?: { documentId: number; account: string; baseAsset: string; quoteAsset: string }
  txLog: Array<{ ts: string; type: string; result: string; hash: string }>
}

export type AppState = HackathonState

export interface AppStateView {
  /** null until the first successful fetch — `state/hackathon.json` (mirrored to
   * `public/state.json` by `saveState()`) only exists once a demo step has run. */
  state: AppState | null
  hasState: boolean
  /** Set when the file is missing or malformed, so pages can say which it is. */
  error: string | null
}

const EMPTY: AppStateView = { state: null, hasState: false, error: null }

/**
 * Polls the object-ID file the protocol scripts write. One of this app's only two data
 * sources (the other is live RPC) — CLAUDE.md: if a page needs a fact that is in neither,
 * write it into the state file from the protocol scripts rather than adding a server.
 */
export function useAppState(pollMs = 5000): AppStateView {
  const [view, setView] = useState<AppStateView>(EMPTY)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      try {
        const response = await fetch('/state.json', { cache: 'no-store' })
        if (!response.ok) throw new Error(`state.json returned ${response.status}`)
        // Vite's dev server answers an unknown path with the app shell rather than a 404, so
        // a missing state file arrives as HTML with a 200. Say that plainly instead of
        // surfacing a JSON parse error about an unexpected `<`.
        const body = await response.text()
        if (body.trimStart().startsWith('<')) {
          throw new Error('no state.json yet — the dev server returned the app shell')
        }
        const state = JSON.parse(body) as AppState
        if (!cancelled) setView({ state, hasState: true, error: null })
      } catch (err) {
        if (!cancelled) {
          setView((prev) => ({ ...prev, error: err instanceof Error ? err.message : String(err) }))
        }
      }
      if (!cancelled) timer = setTimeout(poll, pollMs)
    }

    void poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [pollMs])

  return view
}

/** `txLog` newest first. Safe on a state file written before `txLog` existed. */
export function txLogNewestFirst(state: AppState | null): AppState['txLog'] {
  if (!state?.txLog?.length) return []
  return [...state.txLog].sort((a, b) => b.ts.localeCompare(a.ts))
}
