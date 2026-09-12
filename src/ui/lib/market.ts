import { LedgerEntry, type Client } from 'xrpl'
import type { AppState } from './appState'
import { useLedgerQuery, type LedgerQuery } from './ledger'

/**
 * The open protection market's read side.
 *
 * A policy is an ordinary `Escrow`: the seller locks XRP with the referee's published
 * crypto-condition and names the buyer as `Destination`. Nothing on-ledger marks it as
 * insurance, and nothing links it to the `Loan` it refers to — the condition it carries
 * is the only association, which is why discovery here is "scan the accounts we know
 * about and match the condition" rather than a query. See the page's own closing panel.
 */

/** `Sequence` is missing from xrpl.js's `Escrow` model but present in every
 * `account_objects` response — and it is exactly the `OfferSequence` that
 * `EscrowFinish`/`EscrowCancel` require. Verified on the devnet, see docs/FRICTION.md. */
type EscrowObject = LedgerEntry.Escrow & { Sequence?: number }

export interface PublishedCondition {
  loan: string
  condition: string
  /** Empty until the referee reveals it — `publicView()` in the protocol's `state.ts`
   * strips it from the file this browser reads, so an unrevealed policy cannot be
   * claimed by whoever happens to open the page. */
  fulfillment: string
  revealed: boolean
  revealedAt?: string
}

export interface Policy {
  /** Stable across refetches: an escrow is addressed by owner + the creating sequence. */
  key: string
  seller: string
  buyer: string
  offerSequence: number
  amountDrops: string
  condition: string
  /** Which published condition this policy matches, or null for an escrow that happens to
   * sit on a watched account and is nothing to do with this market. */
  loan: string | null
  cancelAfter: number | null
  claimable: boolean
}

export function publishedConditions(state: AppState | null): PublishedCondition[] {
  const conditions = state?.market?.conditions ?? []
  return conditions.map((entry) => ({
    loan: entry.loan,
    condition: entry.condition,
    fulfillment: entry.fulfillment ?? '',
    revealed: Boolean(entry.revealed),
    revealedAt: entry.revealedAt,
  }))
}

export function refereeAddress(state: AppState | null): string | null {
  return state?.market?.referee ?? null
}

/** Every account whose escrows are worth scanning: the demo's own roles, plus whoever is
 * connected, plus anything the visitor pasted in. An escrow is listed in both the owner's
 * and the destination's directory (verified on-ledger), so a buyer sees policies written
 * to them without knowing who wrote them. */
export function watchedAccounts(
  state: AppState | null,
  connected: string | null,
  extra: string[],
): string[] {
  const roles = Object.values(state?.accounts ?? {})
  return [...new Set([...(connected ? [connected] : []), ...roles, ...extra])].filter(Boolean)
}

async function escrowsFor(client: Client, account: string): Promise<EscrowObject[]> {
  try {
    const { result } = await client.request({ command: 'account_objects', account, type: 'escrow' })
    return result.account_objects.filter(
      (object): object is EscrowObject => object.LedgerEntryType === 'Escrow',
    )
  } catch {
    // An account that does not exist yet (a freshly created wallet, a devnet reset) is a
    // normal state here, not an error worth blanking the table for.
    return []
  }
}

export function usePolicies(
  state: AppState | null,
  connected: string | null,
  extra: string[],
): LedgerQuery<Policy[]> {
  const accounts = watchedAccounts(state, connected, extra)
  const conditions = publishedConditions(state)
  const byCondition = new Map(conditions.map((entry) => [entry.condition, entry]))

  return useLedgerQuery<Policy[]>(
    async (client) => {
      const found = new Map<string, Policy>()
      for (const account of accounts) {
        for (const escrow of await escrowsFor(client, account)) {
          if (!escrow.Condition || escrow.Sequence === undefined) continue
          const match = byCondition.get(escrow.Condition)
          if (!match) continue
          const key = `${escrow.Account}:${escrow.Sequence}`
          found.set(key, {
            key,
            seller: escrow.Account,
            buyer: escrow.Destination,
            offerSequence: escrow.Sequence,
            amountDrops: escrow.Amount,
            condition: escrow.Condition,
            loan: match.loan,
            cancelAfter: escrow.CancelAfter ?? null,
            claimable: match.revealed && Boolean(match.fulfillment),
          })
        }
      }
      return [...found.values()].sort((a, b) => a.key.localeCompare(b.key))
    },
    [accounts.join(','), conditions.map((c) => `${c.condition}:${c.revealed}`).join(',')],
    // A dozen accounts is a dozen requests per pass; this table does not need to move on
    // every four-second close.
    { refreshEveryTicks: 3 },
  )
}

export function useXrpBalance(address: string | null): LedgerQuery<string> {
  return useLedgerQuery<string>(
    !address
      ? null
      : async (client) => {
          const { result } = await client.request({
            command: 'account_info',
            account: address,
            ledger_index: 'validated',
          })
          return result.account_data.Balance
        },
    [address],
  )
}

/* ── This browser's own submissions ─────────────────────────────────────────────────
 * The protocol scripts write every transaction they send into `state.json`'s txLog; a
 * page cannot, because there is no backend to write to. So a wallet submission is
 * recorded here instead, per browser, and labelled as such on screen — never mixed into
 * the Explorer's ledger-backed log. */

export interface LocalTx {
  ts: string
  type: string
  result: string
  hash: string
  note?: string
}

const LOG_KEY = 'trustflow.market.log'
const LOG_MAX = 25

export function readLocalLog(): LocalTx[] {
  try {
    const raw = window.localStorage.getItem(LOG_KEY)
    return raw ? (JSON.parse(raw) as LocalTx[]) : []
  } catch {
    return []
  }
}

export function appendLocalLog(entry: LocalTx): LocalTx[] {
  const next = [entry, ...readLocalLog()].slice(0, LOG_MAX)
  try {
    window.localStorage.setItem(LOG_KEY, JSON.stringify(next))
  } catch {
    // Private window, or storage disabled — the table just stays empty.
  }
  return next
}
