import type { Client, SubmittableTransaction, Wallet } from 'xrpl'
import { signLoanSetByCounterparty } from 'xrpl'
import { submit, submitBlob } from '../lib/submit.js'
import { createdNode } from '../lib/meta.js'
import { mptBaseUnits } from '../lib/mpt.js'
import { ledgerEntry } from '../lib/query.js'
import { rippleNow } from '../lib/time.js'
import { logFriction } from '../lib/friction.js'
import { loadState, saveState, type LoanState } from '../lib/state.js'

export interface LoanTerms {
  /** Real magnitude in TFEUR, e.g. 1500 for €1,500 — converted to base units before
   * being sent as `PrincipalRequested`, see the friction entry in docs/FRICTION.md
   * dated the confirmation of this ledger behavior. */
  principal: number
  /** 1/10th bps; 100000 = 100%. */
  interestRate: number
  paymentTotal: number
  /** Seconds, >= 60. */
  paymentInterval: number
  /** Seconds, in [60, paymentInterval]. */
  gracePeriod: number
}

const TF_LOAN_FULL_PAYMENT = 0x00020000
const TF_LOAN_LATE_PAYMENT = 0x00040000

/** `LoanSet` is dual-signed: the borrower signs first, the broker owner (manager)
 * counter-signs on top via `signLoanSetByCounterparty` (a distinct signing prefix,
 * `fixCleanup3_4_0`), and whoever submits pays a fee of >= 2x base fee. Principal
 * reaches the borrower in this same transaction — there is no separate drawdown step
 * (a documented spec/hackathon-brief divergence, see FEEDBACK_REPORT.md). */
export async function originate(
  client: Client,
  sme: Wallet,
  manager: Wallet,
  loanBrokerId: string,
  slot: 'A' | 'B',
  terms: LoanTerms,
): Promise<LoanState> {
  const state = loadState()
  const existing = state.loans[slot]
  if (existing) return existing

  const tx: Record<string, unknown> = {
    TransactionType: 'LoanSet',
    Account: sme.classicAddress,
    LoanBrokerID: loanBrokerId,
    PrincipalRequested: mptBaseUnits(terms.principal),
    InterestRate: terms.interestRate,
    PaymentTotal: terms.paymentTotal,
    PaymentInterval: terms.paymentInterval,
    GracePeriod: terms.gracePeriod,
  }

  const prepared = await client.autofill(tx as unknown as SubmittableTransaction)
  // XLS-66 §3.8.4 wants >= 2x base fee for the counterparty signature, and whatever Fee
  // is used must be fixed before EITHER party signs. Measured since (see docs/FRICTION.md):
  // xrpl.js 5.2.0's autofill already does this — it returns Fee 24 for a LoanSet against
  // 12 for a plain transaction, and says so on stdout. This explicit value is therefore
  // redundant belt-and-braces, not a requirement; plain `autofill` is enough.
  prepared.Fee = '200'
  const signedByBorrower = sme.sign(prepared)
  const countersigned = signLoanSetByCounterparty(manager, signedByBorrower.tx_blob)

  const { meta } = await submitBlob(client, countersigned.tx_blob, 'LoanSet')
  const { index: loanId, fields } = createdNode(meta, 'Loan')

  // CONFIRMED (see docs/FRICTION.md): LoanSet's PrincipalRequested "Number" field is
  // NOT auto-scaled by the funding MPT's AssetScale — it disburses to the borrower's
  // MPToken balance as a raw base-unit count. Passing the real EUR magnitude directly
  // (the original assumption here) put 100x too little TFEUR in the borrower's
  // account. Every Loan Number field (PrincipalOutstanding, TotalValueOutstanding,
  // PeriodicPayment, DebtTotal, CoverAvailable) turns out to share this same
  // base-unit convention, so LoanPay's Amount needs no further conversion — see pay().
  const expected = Number(mptBaseUnits(terms.principal))
  const recorded = Number(fields.PrincipalOutstanding ?? fields.PrincipalRequested ?? NaN)
  if (!Number.isNaN(recorded) && Math.abs(recorded - expected) > 0.01) {
    logFriction({
      where: 'LoanSet PrincipalRequested scale',
      expected: `PrincipalOutstanding ~= ${expected} (base units, AssetScale ${terms.principal} -> ${expected})`,
      got: `PrincipalOutstanding = ${recorded}`,
      note: 'Base-unit scaling assumption may no longer hold for this ledger/version; check ratio.',
    })
  }

  const loan: LoanState = {
    loanId,
    loanBrokerId,
    paymentInterval: terms.paymentInterval,
    gracePeriod: terms.gracePeriod,
    startDate: rippleNow(),
  }
  state.loans[slot] = loan
  saveState(state)
  return loan
}

export async function pay(
  client: Client,
  sme: Wallet,
  loan: LoanState,
  issuanceId: string,
  opts: { full?: boolean; late?: boolean } = {},
) {
  const entry = await ledgerEntry(client, loan.loanId)
  // XLS-66 3.11.2: tfLoanFullPayment on a loan whose PaymentRemaining == 1 returns
  // tecKILLED ("use a regular payment for the final payment") — early full payoff
  // only makes sense while more than one payment remains. On the last installment,
  // fall back to a regular payment; PeriodicPayment alone settles it since nothing
  // is left after.
  const isFinalPayment = Number(entry.PaymentRemaining ?? 0) <= 1
  const full = Boolean(opts.full) && !isFinalPayment
  const rawValue = full ? entry.TotalValueOutstanding : entry.PeriodicPayment
  // TotalValueOutstanding/PeriodicPayment are already base-unit counts on this ledger
  // (see the scale note in originate()), matching LoanPay's MPTAmount directly — no
  // AssetScale conversion here. Round up so a fractional-base-unit remainder from the
  // interest math never leaves the payment short of what LoanPay requires.
  const value = String(Math.ceil(Number(rawValue)))

  let flags = 0
  if (full) flags |= TF_LOAN_FULL_PAYMENT
  if (opts.late) flags |= TF_LOAN_LATE_PAYMENT

  return submit(client, sme, {
    TransactionType: 'LoanPay',
    LoanID: loan.loanId,
    Amount: { mpt_issuance_id: issuanceId, value },
    ...(flags ? { Flags: flags } : {}),
  })
}

const TF_LOAN_IMPAIR = 0x00020000
const TF_LOAN_DEFAULT = 0x00010000

/** Only valid once the loan is overdue (`fixCleanup3_4_0`: `now > NextPaymentDueDate`). */
export async function impair(client: Client, manager: Wallet, loan: LoanState) {
  return submit(client, manager, { TransactionType: 'LoanManage', LoanID: loan.loanId, Flags: TF_LOAN_IMPAIR })
}

/** Broker owner only; only once `now > NextPaymentDueDate + GracePeriod`, else
 * `tecTOO_SOON`. Consumes `LoanBroker.CoverAvailable` (first-loss capital) before the
 * vault itself takes any loss. */
export async function defaultLoan(client: Client, manager: Wallet, loan: LoanState, expect?: string) {
  return submit(
    client,
    manager,
    { TransactionType: 'LoanManage', LoanID: loan.loanId, Flags: TF_LOAN_DEFAULT },
    { expect },
  )
}
