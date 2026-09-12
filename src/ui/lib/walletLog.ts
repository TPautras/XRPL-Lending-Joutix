/**
 * Per-browser record of transactions submitted by a connected wallet, for every page that
 * signs (Dashboard, The Gate, Market) — not just the Market page. The protocol scripts
 * write their own submissions into `state.json`'s `txLog`; a page cannot, because there is
 * no backend to write to, so a wallet submission is recorded here instead and labelled as
 * such on screen. Distinct localStorage key from Market's own log (`lib/market.ts`): that
 * page predates this shared module and its log stays scoped to policies only.
 */
export interface LocalTx {
  ts: string
  type: string
  result: string
  hash: string
  note?: string
}

const LOG_KEY = 'trustflow.wallet.log'
const LOG_MAX = 25

export function readWalletLog(): LocalTx[] {
  try {
    const raw = window.localStorage.getItem(LOG_KEY)
    return raw ? (JSON.parse(raw) as LocalTx[]) : []
  } catch {
    return []
  }
}

export function appendWalletLog(entry: LocalTx): LocalTx[] {
  const next = [entry, ...readWalletLog()].slice(0, LOG_MAX)
  try {
    window.localStorage.setItem(LOG_KEY, JSON.stringify(next))
  } catch {
    // Private window, or storage disabled — the table just stays empty.
  }
  return next
}
