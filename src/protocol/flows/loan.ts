import type { Client, SubmittableTransaction, Wallet } from 'xrpl'
import { signLoanSetByCounterparty } from 'xrpl'
import { submit, submitBlob } from '../lib/submit.js'
import { createdNode } from '../lib/meta.js'
import { numberField } from '../lib/mpt.js'
import { ledgerEntry } from '../lib/query.js'
import { rippleNow } from '../lib/time.js'
import { logFriction } from '../lib/friction.js'
import { loadState, saveState, type LoanState } from '../lib/state.js'

export interface LoanTerms {
  /** Real magnitude in TFEUR, e.g. 1500 for €1,500 — NOT base units, see numberField(). */
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
    PrincipalRequested: numberField(terms.principal),
    InterestRate: terms.interestRate,
    PaymentTotal: terms.paymentTotal,
    PaymentInterval: terms.paymentInterval,
    GracePeriod: terms.gracePeriod,
  }

  const prepared = await client.autofill(tx as unknown as SubmittableTransaction)
  prepared.Fee = '200' // >= 2x base fee for the counterparty signature; set before either signature
  const signedByBorrower = sme.sign(prepared)
  const countersigned = signLoanSetByCounterparty(manager, signedByBorrower.tx_blob)

  const { meta } = await submitBlob(client, countersigned.tx_blob, 'LoanSet')
  const { index: loanId, fields } = createdNode(meta, 'Loan')

  // PrincipalRequested is a bare "Number" field, not an MPTAmount — the working
  // assumption (see lib/mpt.ts) is that it's a plain decimal magnitude, unscaled by
  // AssetScale. Confirm against what the ledger actually recorded; if this fires,
  // the assumption is wrong and every "Number"-typed amount in this codebase needs
  // to switch to base-unit scaling.
  const recorded = Number(fields.PrincipalOutstanding ?? fields.PrincipalRequested ?? NaN)
  if (!Number.isNaN(recorded) && Math.abs(recorded - terms.principal) > 0.01) {
    logFriction({
      where: 'LoanSet PrincipalRequested scale',
      expected: `PrincipalOutstanding ~= ${terms.principal} (plain magnitude, no AssetScale factor)`,
      got: `PrincipalOutstanding = ${recorded}`,
      note: 'lib/mpt.ts numberField() assumption may be wrong for this ledger/version; check ratio for a x100 factor.',
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
  const rawValue = opts.full ? entry.TotalValueOutstanding : entry.PeriodicPayment
  const value = String(rawValue)

  let flags = 0
  if (opts.full) flags |= TF_LOAN_FULL_PAYMENT
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
