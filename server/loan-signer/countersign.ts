import type { Wallet } from 'xrpl'
import { signLoanSetByCounterparty } from 'xrpl'

/**
 * Applies the broker-owner's counter-signature to an already borrower-signed `LoanSet`
 * blob and returns the fully-signed blob, ready to submit. Ports
 * `docs/snippets/loan-set-dual-sign.ts`'s signing step exactly -- no autofill, no
 * re-signing, no network call in here. The borrower's half (autofill + first signature)
 * already happened client-side before this runs.
 */
export function countersignAndBuildSubmission(brokerWallet: Wallet, txBlob: string): string {
  return signLoanSetByCounterparty(brokerWallet, txBlob).tx_blob
}
