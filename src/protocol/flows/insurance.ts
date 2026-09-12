import type { Client, Wallet } from 'xrpl'
import { submit } from '../lib/submit.js'
import { mptAmount } from '../lib/mpt.js'
import { rippleTimePlusSeconds } from '../lib/time.js'
import { newCondition } from '../lib/condition.js'
import { loadState, saveState } from '../lib/state.js'

/** Credit insurance on a specific loan: the insurer locks the covered amount in a
 * TokenEscrow; the buyer pays periodic premiums as plain Payments. This can only
 * release two ways: the manager (the "referee" who holds the crypto-condition
 * fulfillment) reveals it via EscrowFinish once they've recorded a real default on
 * the loan, or anyone cancels it after CancelAfter once the loan has performed. See
 * CLAUDE.md "the wall" — there is no on-ledger link between this escrow and the
 * Loan's state; the manager watching and deciding IS the trust assumption. */
export async function sellProtection(
  client: Client,
  insurer: Wallet,
  buyer: Wallet,
  issuanceId: string,
  coveredUnits: number,
  cancelAfterSeconds: number,
): Promise<void> {
  const state = loadState()
  if (state.insurance) return

  const { condition, fulfillment } = newCondition()
  const cancelAfter = rippleTimePlusSeconds(cancelAfterSeconds)

  await submit(client, insurer, {
    TransactionType: 'EscrowCreate',
    Destination: buyer.classicAddress,
    Amount: mptAmount(issuanceId, coveredUnits),
    Condition: condition,
    CancelAfter: cancelAfter,
  })

  // OfferSequence for EscrowFinish/EscrowCancel is the EscrowCreate transaction's own
  // (account) Sequence number, not a ledger position — read it back from the
  // account's escrow objects rather than assume where it lands in tx metadata.
  const { result } = await client.request({
    command: 'account_objects',
    account: insurer.classicAddress,
    type: 'escrow',
  } as never)
  const escrows = (result as { account_objects: Array<Record<string, unknown>> }).account_objects
  const created = escrows.find((e) => e.Destination === buyer.classicAddress && e.Condition === condition)
  if (!created) throw new Error('EscrowCreate succeeded but the resulting Escrow object was not found')

  state.insurance = {
    owner: insurer.classicAddress,
    offerSequence: Number(created.Sequence),
    condition,
    fulfillment,
    cancelAfter,
    destination: buyer.classicAddress,
    amount: mptAmount(issuanceId, coveredUnits).value,
  }
  saveState(state)
}

export async function payPremium(
  client: Client,
  buyer: Wallet,
  insurer: Wallet,
  issuanceId: string,
  units: number,
): Promise<void> {
  await submit(client, buyer, {
    TransactionType: 'Payment',
    Destination: insurer.classicAddress,
    Amount: mptAmount(issuanceId, units),
  })
}

/** The manager, as referee, reveals the fulfillment once they've recorded the real
 * default — this is the trusted step "the wall" is about. */
export async function payoutProtection(client: Client, manager: Wallet): Promise<void> {
  const state = loadState()
  if (!state.insurance) throw new Error('No insurance escrow in state')
  if (state.insurance.released) return

  await submit(client, manager, {
    TransactionType: 'EscrowFinish',
    Owner: state.insurance.owner,
    OfferSequence: state.insurance.offerSequence,
    Condition: state.insurance.condition,
    Fulfillment: state.insurance.fulfillment,
  })

  state.insurance.released = true
  saveState(state)
}

/** If the loan performs, anyone can cancel the escrow after CancelAfter — the
 * insurer reclaims their collateral and keeps the premiums already paid. */
export async function expireProtection(client: Client, anyWallet: Wallet): Promise<void> {
  const state = loadState()
  if (!state.insurance) throw new Error('No insurance escrow in state')
  if (state.insurance.cancelled) return

  await submit(client, anyWallet, {
    TransactionType: 'EscrowCancel',
    Owner: state.insurance.owner,
    OfferSequence: state.insurance.offerSequence,
  })

  state.insurance.cancelled = true
  saveState(state)
}
