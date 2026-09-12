/**
 * Reusable snippet: the two-party `LoanSet` (XLS-66) signature flow.
 *
 * `LoanSet` is the one XLS-66 transaction that needs two signatures — the
 * Borrower's, then the LoanBroker owner's counter-signature over the *signed*
 * blob (a distinct signing prefix, `fixCleanup3_4_0`) — and it is, per
 * TrustFlow's FEEDBACK_REPORT.md §5, "the single most predictable time sink for
 * every team at this event." This file is that bonus contribution: a
 * self-contained, copy-pasteable version of the flow, independent of any one
 * project's types or state.
 *
 * Two things this gets right that are easy to get wrong the first time:
 *
 * 1. `Fee` must be fixed *before either party signs*, because the counterparty
 *    signature covers the whole prepared transaction including `Fee`. Signing
 *    with `autofill()`'s own `Fee`, then re-autofilling afterwards, silently
 *    invalidates the first signature.
 * 2. You do **not** need to compute the ">= 2x base fee" XLS-66 §3.8.4 asks
 *    for yourself. `xrpl.js` 5.2.0's `autofill()` already detects `LoanSet` and
 *    doubles the fee for you (measured: `Fee: "24"` for a `LoanSet` against
 *    `"12"` for a plain transaction) — the gap is that §3.8.4 says nothing
 *    about client-side support, so this is discoverable only by reading
 *    `autofill`'s own console output or its source. Trust it; don't hand-roll
 *    fee math on top of it.
 *
 * Usage:
 *
 *   const loan = await signAndSubmitLoanSet(client, {
 *     borrower,
 *     brokerOwner: manager,
 *     tx: {
 *       LoanBrokerID: loanBrokerId,
 *       PrincipalRequested: '150000', // base units of the funding asset -- see the
 *                                     // note below, and TrustFlow FEEDBACK_REPORT.md §7
 *       InterestRate: 100000,
 *       PaymentTotal: 12,
 *       PaymentInterval: 30 * 24 * 60 * 60,
 *       GracePeriod: 3 * 24 * 60 * 60,
 *     },
 *   })
 *
 * One field worth flagging while you're here, even though it's a separate
 * finding (FEEDBACK_REPORT.md §7): `PrincipalRequested` and the other Loan
 * "Number" fields are **not** auto-scaled by the funding MPT's `AssetScale`.
 * They're raw base units, the same as an `MPTAmount.value` — convert your real
 * magnitude yourself before calling this.
 */
import type { Client, SubmittableTransaction, Wallet } from 'xrpl'
import { signLoanSetByCounterparty } from 'xrpl'

export interface LoanSetFields {
  LoanBrokerID: string
  /** Base units of the funding asset -- not auto-scaled by AssetScale. */
  PrincipalRequested: string
  /** 1/10th bps; 100000 = 100%. */
  InterestRate: number
  PaymentTotal: number
  /** Seconds, >= 60. */
  PaymentInterval: number
  /** Seconds, in [60, PaymentInterval]. */
  GracePeriod: number
  [extra: string]: unknown
}

export interface SignAndSubmitLoanSetArgs {
  /** The account requesting the loan -- signs first. */
  borrower: Wallet
  /** The LoanBroker's `Owner` account -- counter-signs on top. */
  brokerOwner: Wallet
  tx: LoanSetFields
}

/**
 * Autofills, dual-signs and submits a `LoanSet`, waiting for validation.
 * Throws on anything other than `tesSUCCESS` -- check the thrown error's
 * `resultCode` for the raw engine code rather than guessing from the message.
 */
export async function signAndSubmitLoanSet(client: Client, { borrower, brokerOwner, tx }: SignAndSubmitLoanSetArgs) {
  const prepared = await client.autofill({
    TransactionType: 'LoanSet',
    Account: borrower.classicAddress,
    ...tx,
  } as unknown as SubmittableTransaction)
  // `autofill()` already set a LoanSet-appropriate Fee (>= 2x base fee, XLS-66
  // §3.8.4) here -- nothing to add. The one rule: don't call autofill() again
  // after this point, on either side, or the borrower's signature stops
  // matching what gets submitted.

  const signedByBorrower = borrower.sign(prepared)
  const countersigned = signLoanSetByCounterparty(brokerOwner, signedByBorrower.tx_blob)

  const response = await client.submitAndWait(countersigned.tx_blob)
  const meta = response.result.meta
  const resultCode =
    meta && typeof meta === 'object' && 'TransactionResult' in meta
      ? String((meta as { TransactionResult: string }).TransactionResult)
      : 'unknown'

  if (resultCode !== 'tesSUCCESS') {
    const err = new Error(`LoanSet returned ${resultCode}, expected tesSUCCESS`)
    ;(err as Error & { resultCode: string }).resultCode = resultCode
    throw err
  }
  return response.result
}
