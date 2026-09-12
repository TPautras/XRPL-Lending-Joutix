import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const STATE_PATH = join(REPO_ROOT, 'state', 'hackathon.json')
// Vite serves `public/` verbatim at the site root, so the dashboard can just
// `fetch('/state.json')` at runtime with no build-time import of a file that may not
// exist yet (state/hackathon.json only appears once `npm run demo setup` has run).
const DASHBOARD_COPY_PATH = join(REPO_ROOT, 'public', 'state.json')

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
 * and it is also the whole trust assumption: see `publicView()` for why the fulfillment
 * is not in the file the browser reads until the referee has actually revealed it.
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

/** One row of the Phase 2 access matrix. Structurally identical to
 * `flows/gate.ts`'s `GateObservation` — repeated here rather than imported so this
 * module keeps depending on nothing (flows import state, never the other way). */
export interface GateObservationRecord {
  state: string
  action: string
  result: string
  hash: string
  note?: string
}

export interface HackathonState {
  mptIssuanceId?: string
  credentialType?: string
  domainId?: string
  vault?: { vaultId: string; shareMptId: string; private: boolean }
  loanBrokerId?: string
  loans: { A?: LoanState; B?: LoanState }
  insurance?: EscrowState
  /** The open protection market (`npm run demo referee`): the referee's address and the
   * conditions anyone may write a policy against. */
  market?: { referee: string; conditions: MarketCondition[] }
  /** role name -> classic address. Written by `demo.ts` on every run so the webapp's
   * Gate page can read each participant's credential state straight off the ledger:
   * the browser has no access to `.env`, and CLAUDE.md's rule for a fact the UI needs
   * is to write it into the state file rather than stand up a backend. */
  accounts?: Record<string, string>
  /** What the ledger answered in the last `npm run demo gate` run (the four-state
   * credential walk plus the borrow-side probe), so the Gate page renders real hashes
   * instead of a table retyped by hand. */
  gate?: { ts: string; observations: GateObservationRecord[] }
  /** The manager's XLS-47 Price Oracle valuing the receivable currently financed —
   * see `flows/oracle.ts`. Informational only: `LoanSet`/`LoanManage` consult no
   * `Oracle` object, so nothing here feeds back into loan-to-value or cover math. */
  oracle?: { documentId: number; account: string; baseAsset: string; quoteAsset: string }
  txLog: Array<{ ts: string; type: string; result: string; hash: string }>
}

const EMPTY: HackathonState = { loans: {}, txLog: [] }

export function loadState(): HackathonState {
  if (!existsSync(STATE_PATH)) return structuredClone(EMPTY)
  return JSON.parse(readFileSync(STATE_PATH, 'utf-8')) as HackathonState
}

export function saveState(state: HackathonState): void {
  // Flows load state once, run their submit()s (each of which appends its own
  // txLog entry via appendTxLog below), then save the same in-memory `state` at
  // the end — a plain overwrite here would clobber those entries with the stale
  // txLog snapshot the flow started with. Union with what's on disk by hash so
  // no entry appended mid-flow is ever lost, then keep chronological order.
  const onDisk = existsSync(STATE_PATH) ? (JSON.parse(readFileSync(STATE_PATH, 'utf-8')) as HackathonState) : EMPTY
  const seen = new Set(state.txLog.map((e) => e.hash))
  const mergedLog = [...state.txLog, ...onDisk.txLog.filter((e) => !seen.has(e.hash))]
  mergedLog.sort((a, b) => a.ts.localeCompare(b.ts))
  writeState({ ...state, txLog: mergedLog })
}

/**
 * What the browser is allowed to see. `public/state.json` is served to anyone who opens
 * the site, so every crypto-condition fulfillment is stripped out of it until the moment
 * it is deliberately revealed: a fulfillment is the secret that releases an escrow, and
 * publishing it early would let anyone finish a policy before the loan it insures has
 * defaulted — including policies written by visitors with their own money.
 *
 * The demo's own `insurance` escrow keeps its fulfillment until `released`, by which
 * point it is on-ledger in the `EscrowFinish` anyway and is evidence rather than a secret.
 */
function publicView(state: HackathonState): HackathonState {
  const insurance = state.insurance
  const market = state.market
  return {
    ...state,
    insurance: insurance && !insurance.released ? { ...insurance, fulfillment: '' } : insurance,
    market: market && {
      ...market,
      conditions: market.conditions.map((entry) =>
        entry.revealed ? entry : { ...entry, fulfillment: '' },
      ),
    },
  }
}

function writeState(state: HackathonState): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true })
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
  // Mirrored into src/ui so the dashboard (served by Vite, browser-side) can read
  // the object IDs without a backend — see CLAUDE.md's "no wallet signing" dashboard.
  // Redacted on the way out: the mirror is public, the state file is not.
  mkdirSync(dirname(DASHBOARD_COPY_PATH), { recursive: true })
  writeFileSync(DASHBOARD_COPY_PATH, JSON.stringify(publicView(state), null, 2))
}

export function resetState(): void {
  writeState(structuredClone(EMPTY))
}

/** Appends one entry to txLog and persists immediately — called from lib/submit.ts
 * on every transaction, independent of whatever flow-level state a caller may also
 * be holding and will save later (see the merge in saveState above). */
export function appendTxLog(entry: { ts: string; type: string; result: string; hash: string }): void {
  const state = loadState()
  state.txLog.push(entry)
  writeState(state)
}

/** Records each role's address (idempotent: a no-op write is skipped so re-running a
 * step does not churn the file the dashboard polls). Roles whose `.env` seed is blank
 * get a random wallet from `loadWallets()`, so an address here is only as real as the
 * seed behind it — `npm run probe` is what makes them funded and stable. */
export function recordAccounts(accounts: Record<string, string>): void {
  const state = loadState()
  const merged = { ...state.accounts, ...accounts }
  if (state.accounts && JSON.stringify(merged) === JSON.stringify(state.accounts)) return
  state.accounts = merged
  writeState(state)
}

export function recordGate(observations: GateObservationRecord[]): void {
  const state = loadState()
  state.gate = { ts: new Date().toISOString(), observations }
  writeState(state)
}
