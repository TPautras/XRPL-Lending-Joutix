import test from 'node:test'
import assert from 'node:assert/strict'
import { Wallet, decode } from 'xrpl'
import { countersignAndBuildSubmission } from './countersign.ts'

/**
 * Fixture keypairs -- both are well-known xrpl.js documentation test seeds, never real
 * accounts. Never put a real seed in this file or any fixture it loads.
 */
const BORROWER_ADDRESS = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
const BROKER_SEED = 'sEd7rBGm5kxzauRTAV2hbsNz7N45X91'

/**
 * A borrower-signed `LoanSet` blob, generated once offline (fixed Sequence/Fee/
 * LastLedgerSequence -- no autofill, no network) via:
 *
 *   const borrower = Wallet.fromSeed('sEdTM1uX8pu2do5XvTnutH6HsouMaM2')
 *   const tx = { TransactionType: 'LoanSet', Account: borrower.classicAddress,
 *     LoanBrokerID: 'A'.repeat(64), PrincipalRequested: '150000', InterestRate: 100000,
 *     PaymentTotal: 12, PaymentInterval: 2592000, GracePeriod: 259200, Fee: '24',
 *     Sequence: 10, LastLedgerSequence: 1000000, SigningPubKey: borrower.publicKey }
 *   borrower.sign(tx).tx_blob
 *
 * Checked in as a fixture per the plan (docs/plans/loanset-signing-service.md step 2) --
 * the test must not hit the network or a live ledger.
 */
const BORROWER_SIGNED_BLOB =
  '120050240000000A201B000F4240203700278D0020380003F480203C0000000C2041000186A05025AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA6840000000000000187321EDA57EBBCB502C2009EFE17229E8DC865DCCB192C52D7888D624DC9EBADDB815F07440E7AD84973DE12911B4B8DAD5E1308B83751E45FA9C671FA256FD4EB24EA20F3B9BFB942C39F48949AA92A77D8E0425A88C1520F2CE7304400B2DB1EB764F6D078114A6070B8A1822E3322676A99F0C804EE2D15B82709E14D1120D7B160000FFFFFFF3'

test('countersignAndBuildSubmission adds the broker counter-signature over the borrower-signed blob', () => {
  const broker = Wallet.fromSeed(BROKER_SEED)

  const submissionBlob = countersignAndBuildSubmission(broker, BORROWER_SIGNED_BLOB)

  assert.equal(typeof submissionBlob, 'string')
  assert.match(submissionBlob, /^[0-9A-F]+$/)

  const decoded = decode(submissionBlob) as Record<string, unknown>
  assert.equal(decoded.TransactionType, 'LoanSet')
  assert.equal(decoded.Account, BORROWER_ADDRESS)
  assert.ok(decoded.TxnSignature, 'borrower signature must survive the counter-sign step')

  const counterpartySignature = decoded.CounterpartySignature as
    | { SigningPubKey?: string; TxnSignature?: string }
    | undefined
  assert.ok(counterpartySignature, 'CounterpartySignature must be present')
  assert.equal(counterpartySignature?.SigningPubKey, broker.publicKey)
  assert.ok(counterpartySignature?.TxnSignature, 'broker TxnSignature must be present')
})

test('countersignAndBuildSubmission rejects a blob that is not a LoanSet', () => {
  const broker = Wallet.fromSeed(BROKER_SEED)
  const notLoanSet = Wallet.fromSeed(BROKER_SEED).sign({
    TransactionType: 'AccountSet',
    Account: broker.classicAddress,
    Fee: '12',
    Sequence: 1,
    SigningPubKey: broker.publicKey,
  }).tx_blob

  assert.throws(() => countersignAndBuildSubmission(broker, notLoanSet))
})
