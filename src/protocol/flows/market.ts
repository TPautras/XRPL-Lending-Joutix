import type { Client, Wallet } from 'xrpl'
import { newCondition } from '../lib/condition.js'
import { ledgerEntry } from '../lib/query.js'
import { loadState, saveState, type MarketCondition } from '../lib/state.js'
import { logFriction } from '../lib/friction.js'

/** XLS-66 `lsfLoanDefault` — the same constant `flows/loan.ts` sets via `tfLoanDefault`. */
const LSF_LOAN_DEFAULT = 0x00010000

/**
 * The referee side of the open protection market.
 *
 * The market itself needs no protocol support and no privileged transaction: a policy is
 * an `EscrowCreate` that anyone can submit from their own wallet, carrying a condition
 * published here. What the referee — the manager — holds is the fulfillment, and the only
 * thing this module does is decide when that becomes public.
 *
 * That is "the wall" (CLAUDE.md) with visitors' money in it rather than the demo's:
 * TokenEscrow releases on a time condition or a crypto-condition, never on another ledger
 * object's state, so nothing links these escrows to the `Loan` they insure except a named
 * human reading the ledger and choosing to publish a secret. Run this repeatedly — it is
 * idempotent — or on a timer during the demo.
 */
export async function publishConditions(client: Client, referee: Wallet): Promise<MarketCondition[]> {
  const state = loadState()
  const loans = Object.keys(state.loans).filter((key) => state.loans[key as 'A' | 'B'])
  if (loans.length === 0) throw new Error('No loans to insure yet — run `npm run demo s4` or `prestage` first.')

  const market = state.market ?? { referee: referee.classicAddress, conditions: [] }
  market.referee = referee.classicAddress

  let created = false
  for (const loan of loans) {
    if (market.conditions.some((entry) => entry.loan === loan)) continue
    const { condition, fulfillment } = newCondition()
    market.conditions.push({ loan, condition, fulfillment, createdAt: new Date().toISOString() })
    created = true
    console.log(`· Published a condition for loan ${loan}: ${condition}`)
  }
  if (created) logMarketTrustGap()

  state.market = market
  saveState(state)
  await revealDefaulted(client)
  return loadState().market!.conditions
}

/**
 * Reveals the fulfillment for every loan the ledger says is in default, and only those.
 *
 * The check is deliberately made against the `Loan` object rather than against our own
 * state file: the referee's authority here is real money, so what it acts on has to be
 * what the ledger says, not what a previous script run recorded.
 */
export async function revealDefaulted(client: Client): Promise<void> {
  const state = loadState()
  if (!state.market) return

  let changed = false
  for (const entry of state.market.conditions) {
    if (entry.revealed) continue
    const loan = state.loans[entry.loan as 'A' | 'B']
    if (!loan) continue

    const node = await ledgerEntry(client, loan.loanId)
    const flags = Number(node.Flags ?? 0)
    if (!(flags & LSF_LOAN_DEFAULT)) continue

    entry.revealed = true
    entry.revealedAt = new Date().toISOString()
    changed = true
    console.log(`⚑ Loan ${entry.loan} is in default — fulfillment published, every policy on it can now be claimed`)
  }

  if (changed) saveState(state)
}

/** What the referee prints on stage: who can claim, who is still waiting, who has to wait
 * for the expiry instead. */
export function describeMarket(): void {
  const state = loadState()
  if (!state.market || state.market.conditions.length === 0) {
    console.log('No market conditions published yet.')
    return
  }

  console.log(`\n== Protection market (referee ${state.market.referee}) ==`)
  for (const entry of state.market.conditions) {
    const status = entry.revealed ? `REVEALED at ${entry.revealedAt} — policies claimable` : 'sealed — loan performing'
    console.log(`  loan ${entry.loan}  ${entry.condition}`)
    console.log(`    ${status}`)
  }
  console.log(
    '\nAnyone can write a policy against these conditions from the webapp; nothing on-ledger ties\n' +
      'those escrows to the loan. The referee revealing a fulfillment IS the settlement mechanism.',
  )
}

/** Logged once, the first time the market is published: the gap this feature is built on
 * top of is the same one the report names, and it is worth having the running log say so
 * from the side of a product that actually exposes it to strangers. */
export function logMarketTrustGap(): void {
  logFriction({
    where: 'open protection market — EscrowFinish has no way to reference a Loan',
    expected:
      'a policy written by an arbitrary account could name the Loan it insures, so that releasing it depended on that Loan being in default rather than on a person publishing a secret.',
    got:
      "EscrowCreate takes a time condition or a crypto-condition and nothing else, so every policy in this market is released by a PREIMAGE-SHA-256 fulfillment the referee holds. A visitor's capital is locked behind that party's discretion: they can reveal early, or not at all, and the protocol neither prevents nor records either. The escrow cannot ask whether the Loan carries lsfLoanDefault.",
    note:
      'Documented on the /market page in the product itself rather than hidden: the referee is named on screen next to every position. Same gap as FEEDBACK_REPORT.md §1, now with third-party money behind it — which is the argument for a lock that can read another ledger object’s field.',
  })
}
