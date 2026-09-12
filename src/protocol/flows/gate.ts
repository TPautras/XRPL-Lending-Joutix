/**
 * Phase 2 — the gate.
 *
 * CLAUDE.md asks for one thing to be visibly true on stage: an uncredentialed account
 * cannot join the reserve. That is easy to assert and easy to fake, so this file instead
 * walks a *single* account through every credential state the ledger can put it in and
 * records what the ledger actually answers at each one. Nothing here asserts an expected
 * code — every row of the printed matrix is whatever came back.
 *
 * Four deposit-side states:
 *   none                  no `Credential` object at all
 *   issued, not accepted  the issuer created it; the subject never ran `CredentialAccept`
 *   accepted              the full XLS-70 handshake
 *   revoked               `CredentialDelete` after the account already deposited
 *
 * and two things that matter more than any single one of them:
 *   - withdrawal after revocation, which must still succeed (XLS-65 §7: `VaultWithdraw`
 *     deliberately does not respect permissioned-domain rules, so that revoking a
 *     credential can never strand a depositor's funds). This is TrustFlow's headline
 *     compliance design choice and it is a ledger-level guarantee, not our own code.
 *   - `LoanSet` from an uncredentialed borrower against the same gated vault, which
 *     XLS-66 §3.8.5.2 never says anything about. See `probeBorrowSideGate()`.
 */
import type { Client, SubmittableTransaction, Wallet } from 'xrpl'
import { signLoanSetByCounterparty } from 'xrpl'
import { submitBlob } from '../lib/submit.js'
import { mptBaseUnits } from '../lib/mpt.js'
import { vaultInfo, mptBalance } from '../lib/query.js'
import { logFriction } from '../lib/friction.js'
import { loadState, saveState } from '../lib/state.js'
import { deposit, withdraw } from './vault.js'
import { issueCredential, acceptCredential, revokeCredential, credentialStatus } from './credentials.js'
import * as stablecoin from './stablecoin.js'

/** Units of TFEUR the intruder deposits at each probe. Small: this runs against a live
 * devnet reserve that the rest of the demo also uses. */
const PROBE_DEPOSIT_UNITS = 500
/** Kept at >= 2x PROBE_DEPOSIT_UNITS so a re-run never fails for lack of balance. */
const PROBE_FUNDING_UNITS = 2_000
/** Principal for the borrow-side probe. Deliberately tiny — if the ledger lets it
 * through, it is real debt against the real reserve. */
const PROBE_LOAN_UNITS = 5

export interface GateObservation {
  state: string
  action: string
  result: string
  /** Kept so the written report can cite the ledger rather than paraphrase it — the
   * deliverables ask for links to verified on-ledger transactions. */
  hash: string
  note?: string
}

/** Every probe goes through here so the matrix can never disagree with the console. */
async function record(
  observations: GateObservation[],
  state: string,
  action: string,
  run: () => Promise<{ resultCode: string; hash: string }>,
  note?: string,
): Promise<GateObservation> {
  const { resultCode, hash } = await run()
  const observation: GateObservation = { state, action, result: resultCode, hash, note }
  observations.push(observation)
  return observation
}

/**
 * Makes the intruder's rejections mean something. An account with no balance would be
 * refused anyway, and a judge is right to ask which rule actually fired — XLS-65
 * §3.5.2.2 does check the domain (#6) before the balance (#9), but "the spec says the
 * check order saves us" is a much weaker demo than an account that visibly holds the
 * money and is still turned away. Also clears any credential left behind by an earlier
 * run so the walk always starts from the "none" state.
 */
async function resetIntruderToUncredentialed(
  client: Client,
  w: { authority: Wallet; issuer: Wallet; smeUncredentialed: Wallet },
  issuanceId: string,
): Promise<void> {
  const status = await credentialStatus(client, w.authority, w.smeUncredentialed)
  if (status.exists) {
    console.log('  (clearing a credential left over from a previous gate run)')
    await revokeCredential(client, w.authority, w.smeUncredentialed)
  }

  const balance = Number(await mptBalance(client, w.smeUncredentialed.classicAddress, issuanceId))
  const needed = Number(mptBaseUnits(PROBE_DEPOSIT_UNITS))
  if (balance < needed) {
    console.log(`  funding the intruder with ${PROBE_FUNDING_UNITS} TFEUR so its refusal is unambiguous`)
    await stablecoin.payOut(client, w.issuer, w.smeUncredentialed, issuanceId, PROBE_FUNDING_UNITS)
  }
}

/**
 * The reserve is usually lent out almost to the floor by the time this runs, and both
 * probes need real liquidity: the borrow probe needs `Vault.AssetsAvailable >=
 * PrincipalRequested`, and a `tecINSUFFICIENT_FUNDS` there would be indistinguishable
 * from a gate that fired. Top up from a credentialed investor first so that any refusal
 * later is about permissions and nothing else.
 */
async function primeLiquidity(
  client: Client,
  investor: Wallet,
  vaultId: string,
  issuanceId: string,
): Promise<void> {
  const vault = await vaultInfo(client, vaultId)
  const available = Number(vault.AssetsAvailable ?? 0)
  const needed = Number(mptBaseUnits(PROBE_DEPOSIT_UNITS + PROBE_LOAN_UNITS))
  if (available >= needed) return
  console.log(`  reserve has ${available} base units available, priming with a credentialed deposit`)
  await deposit(client, investor, vaultId, issuanceId, PROBE_FUNDING_UNITS)
}

/**
 * The borrow-side experiment, and the reason this file exists.
 *
 * XLS-65 makes the deposit side explicitly permissioned: §3.5.2.2 #6 refuses a
 * `VaultDeposit` into a private vault from an account that is not a member of the
 * share issuance's `PermissionedDomain`. XLS-66's `LoanSet` failure conditions
 * (§3.8.5.2, 24 of them) contain no corresponding check — the only `tecNO_AUTH` cases
 * there (#22, #23) are about the borrower and broker owner being authorized to *hold
 * the asset*, i.e. having an `MPToken`, which is an entirely different thing from
 * being in the domain. So on a plain reading, credit can leave a gated vault to an
 * account that would not be allowed to put money into it.
 *
 * That is a claim about the ledger, so we make the ledger answer it rather than
 * quoting the spec. The result is recorded either way; `tecNO_AUTH` would mean the
 * implementation is stricter than the document and the document needs fixing, and
 * `tesSUCCESS` means the gate genuinely stops at the vault's edge.
 *
 * Framing this correctly matters: `LoanSet` is dual-signed, so the manager must still
 * counter-sign. Nobody can quietly drain the reserve. What is absent is *protocol*
 * enforcement — with the domain in place, an uncredentialed borrower is prevented by
 * the manager's discretion alone, which is exactly the kind of guarantee a compliance
 * officer will not accept on trust.
 */
export async function probeBorrowSideGate(
  client: Client,
  observations: GateObservation[],
  borrower: Wallet,
  manager: Wallet,
  loanBrokerId: string,
): Promise<GateObservation> {
  const tx: Record<string, unknown> = {
    TransactionType: 'LoanSet',
    Account: borrower.classicAddress,
    LoanBrokerID: loanBrokerId,
    PrincipalRequested: mptBaseUnits(PROBE_LOAN_UNITS),
    InterestRate: 10000,
    PaymentTotal: 1,
    PaymentInterval: 60,
    GracePeriod: 60,
  }

  const prepared = await client.autofill(tx as unknown as SubmittableTransaction)
  prepared.Fee = '200' // matches flows/loan.ts; autofill's own 2x would do — see docs/FRICTION.md
  const signedByBorrower = borrower.sign(prepared)
  const countersigned = signLoanSetByCounterparty(manager, signedByBorrower.tx_blob)

  return record(
    observations,
    'none',
    'LoanSet (borrow)',
    () => submitBlob(client, countersigned.tx_blob, 'LoanSet', undefined, true),
    'uncredentialed borrower, gated vault',
  )
}

/** Runs the whole walk and prints the matrix. Safe to re-run: it resets the intruder to
 * the uncredentialed state first and tops up balances it needs. */
export async function proveGate(
  client: Client,
  w: { authority: Wallet; issuer: Wallet; manager: Wallet; investorA: Wallet; smeUncredentialed: Wallet },
): Promise<GateObservation[]> {
  const state = loadState()
  const vaultId = state.vault?.vaultId
  const issuanceId = state.mptIssuanceId
  const loanBrokerId = state.loanBrokerId
  if (!vaultId || !issuanceId || !loanBrokerId) throw new Error('Run `npm run demo setup` first.')
  if (!state.vault?.private) {
    throw new Error('The vault was not created with a DomainID — there is no gate to prove.')
  }

  const observations: GateObservation[] = []
  const intruder = w.smeUncredentialed
  console.log(`  intruder account: ${intruder.classicAddress}`)
  console.log(`  gated vault:      ${vaultId}`)

  console.log('\n== Phase 2: proving the gate ==')
  await primeLiquidity(client, w.investorA, vaultId, issuanceId)
  await resetIntruderToUncredentialed(client, w, issuanceId)

  // ---- state: no credential -------------------------------------------------
  console.log('\n-- no credential --')
  const noCred = await credentialStatus(client, w.authority, intruder)
  if (noCred.exists) throw new Error('Intruder still holds a credential; cannot probe the "none" state.')
  const uncredentialedDeposit = await record(observations, 'none', 'VaultDeposit', () =>
    deposit(client, intruder, vaultId, issuanceId, PROBE_DEPOSIT_UNITS, undefined, true),
  )

  // The borrow side, probed while the same account is still uncredentialed — deliberately
  // in the very next transaction, so the two results are about one account in one state.
  const borrow = await probeBorrowSideGate(client, observations, intruder, w.manager, loanBrokerId)

  // ---- state: issued but never accepted -------------------------------------
  console.log('\n-- credential issued, not accepted --')
  await issueCredential(client, w.authority, intruder, { accept: false })
  const pending = await credentialStatus(client, w.authority, intruder)
  console.log(`  Credential exists=${pending.exists} accepted=${pending.accepted}`)
  if (!pending.exists || pending.accepted) {
    logFriction({
      where: 'CredentialCreate without CredentialAccept',
      expected: 'a Credential object that exists with lsfAccepted clear',
      got: `exists=${pending.exists} accepted=${pending.accepted}`,
    })
  }
  await record(observations, 'issued, not accepted', 'VaultDeposit', () =>
    deposit(client, intruder, vaultId, issuanceId, PROBE_DEPOSIT_UNITS, undefined, true),
  )

  // ---- state: accepted ------------------------------------------------------
  console.log('\n-- credential accepted --')
  await acceptCredential(client, w.authority, intruder)
  const accepted = await credentialStatus(client, w.authority, intruder)
  console.log(`  Credential exists=${accepted.exists} accepted=${accepted.accepted}`)
  const depositAccepted = (
    await record(observations, 'accepted', 'VaultDeposit', () =>
      deposit(client, intruder, vaultId, issuanceId, PROBE_DEPOSIT_UNITS, undefined, true),
    )
  ).result

  // ---- state: revoked after depositing --------------------------------------
  // The whole point of the asymmetry: this account now has money in the reserve and is
  // about to lose its credential.
  console.log('\n-- credential revoked (money already inside) --')
  await revokeCredential(client, w.authority, intruder)
  const revoked = await credentialStatus(client, w.authority, intruder)
  console.log(`  Credential exists=${revoked.exists} accepted=${revoked.accepted}`)
  await record(observations, 'revoked', 'VaultDeposit', () =>
    deposit(client, intruder, vaultId, issuanceId, PROBE_DEPOSIT_UNITS, undefined, true),
  )

  if (depositAccepted === 'tesSUCCESS') {
    await record(
      observations,
      'revoked',
      'VaultWithdraw',
      () => withdraw(client, intruder, vaultId, issuanceId, PROBE_DEPOSIT_UNITS, undefined, true),
      'funds deposited while credentialed',
    )
  } else {
    observations.push({
      state: 'revoked',
      action: 'VaultWithdraw',
      result: 'not attempted',
      hash: '',
      note: 'the accepted-state deposit did not land, so there was nothing to withdraw',
    })
  }

  printMatrix(observations)
  interpret(observations, borrow, uncredentialedDeposit)

  // Persist the matrix so the Gate page can render the ledger's own answers. Without
  // this the evidence only ever existed in stdout and in a table retyped into the
  // README, which is exactly how the two drift apart.
  const after = loadState()
  after.gate = {
    ranAt: new Date().toISOString(),
    intruder: intruder.classicAddress,
    vaultId,
    observations,
  }
  saveState(after)

  return observations
}

function printMatrix(observations: GateObservation[]): void {
  console.log('\n== Gate access matrix (every code read back off the ledger) ==')
  const stateWidth = Math.max(...observations.map((o) => o.state.length), 'credential state'.length)
  const actionWidth = Math.max(...observations.map((o) => o.action.length), 'action'.length)
  const resultWidth = Math.max(...observations.map((o) => o.result.length), 'result'.length)
  console.log(
    `  ${'credential state'.padEnd(stateWidth)}  ${'action'.padEnd(actionWidth)}  ` +
      `${'result'.padEnd(resultWidth)}  tx`,
  )
  for (const o of observations) {
    console.log(
      `  ${o.state.padEnd(stateWidth)}  ${o.action.padEnd(actionWidth)}  ` +
        `${o.result.padEnd(resultWidth)}  ${o.hash || '—'}`,
    )
    if (o.note) console.log(`  ${' '.repeat(stateWidth)}  ${o.note}`)
  }
}

/**
 * Turns the matrix into the two sentences that go in the report, and logs friction when
 * the ledger disagrees with the spec. Deliberately states the *observed* outcome rather
 * than a pre-written conclusion — if the ledger turns out to gate `LoanSet` after all,
 * this says so and the finding becomes a documentation bug instead.
 */
function interpret(
  observations: GateObservation[],
  borrow: GateObservation,
  uncredentialedDeposit: GateObservation,
): void {
  const find = (state: string, action: string) =>
    observations.find((o) => o.state === state && o.action === action)?.result
  const borrowResult = borrow.result

  console.log('\n== What this proves ==')

  const noneDeposit = find('none', 'VaultDeposit')
  const pendingDeposit = find('issued, not accepted', 'VaultDeposit')
  const acceptedDeposit = find('accepted', 'VaultDeposit')
  const revokedDeposit = find('revoked', 'VaultDeposit')
  const revokedWithdraw = find('revoked', 'VaultWithdraw')

  console.log(
    `  Deposit side: none=${noneDeposit}, issued-not-accepted=${pendingDeposit}, ` +
      `accepted=${acceptedDeposit}, revoked=${revokedDeposit}.`,
  )

  if (pendingDeposit === noneDeposit && acceptedDeposit === 'tesSUCCESS') {
    console.log(
      '  An issued-but-unaccepted credential is worth exactly as much as no credential at all —\n' +
        '  the Credential object exists on-ledger and still grants nothing until CredentialAccept.',
    )
  }

  if (revokedDeposit !== 'tesSUCCESS' && revokedWithdraw === 'tesSUCCESS') {
    console.log(
      '  Revocation closes the door without trapping anyone: the same account is refused on the\n' +
        '  way in and served on the way out. XLS-65 §7 makes this a ledger guarantee, not our choice.',
    )
  } else if (revokedWithdraw && revokedWithdraw !== 'tesSUCCESS' && revokedWithdraw !== 'not attempted') {
    logFriction({
      where: 'VaultWithdraw after CredentialDelete',
      expected: 'tesSUCCESS — XLS-65 §7 states VaultWithdraw does not respect permissioned-domain rules',
      got: revokedWithdraw,
      note: 'If this holds, revoking a credential strands depositor funds — the exact outcome the spec says the design avoids.',
    })
  }

  if (borrowResult === 'tesSUCCESS') {
    console.log(
      '\n  Borrow side: LoanSet SUCCEEDED for an account the same vault refuses to accept a deposit\n' +
        '  from. The PermissionedDomain gates capital in and does not gate credit out. The borrower\n' +
        '  is still stopped by the broker refusing to counter-sign — discretion, not protocol.',
    )
    logFriction({
      where: 'LoanSet against a private (domain-gated) vault, uncredentialed borrower',
      expected:
        'a borrower who fails the vault\'s PermissionedDomain check on VaultDeposit (XLS-65 §3.5.2.2 #6) is also refused the loan, or the spec says plainly that it is not',
      got: 'tesSUCCESS — the Loan was created and vault assets were disbursed to an account with no accepted Credential',
      note:
        'XLS-66 §3.8.5.2 lists 24 failure conditions and none consults Vault.ShareMPTID\'s DomainID; its two tecNO_AUTH cases (#22, #23) are asset-holding authorization (MPToken/RippleState), not domain membership. Compliance-gating a vault therefore only gates the deposit side. Either LoanSet should check the domain for the Borrower, or XLS-65/66 should state explicitly that a private vault restricts depositors and not borrowers, because the natural reading of "private vault" is that both sides are permissioned. ' +
        `Repro, same account and same ledger state, two consecutive transactions: VaultDeposit ${uncredentialedDeposit.hash} -> ${uncredentialedDeposit.result}, then LoanSet ${borrow.hash} -> ${borrow.result}. ` +
        'Reproduce with `npm run demo gate`. Note the loan is dual-signed, so the broker must still counter-sign — the gap is that nothing in the protocol stops the broker from doing so.',
    })
  } else if (borrowResult === 'tecNO_AUTH') {
    console.log(
      '\n  Borrow side: LoanSet was refused tecNO_AUTH — the implementation gates the borrower even\n' +
        '  though XLS-66 §3.8.5.2 never mentions the domain. Spec gap rather than protocol gap.',
    )
    logFriction({
      where: 'LoanSet against a private (domain-gated) vault, uncredentialed borrower',
      expected: 'the behaviour to be documented somewhere in XLS-66 §3.8.5.2',
      got: 'tecNO_AUTH — rippled enforces domain membership on the Borrower, but none of the 24 documented failure conditions mentions it',
      note: 'The ledger is stricter than the spec here. Documentation fix: add the PermissionedDomain check to LoanSet\'s failure conditions.',
    })
  } else {
    console.log(
      `\n  Borrow side: INCONCLUSIVE — LoanSet returned ${borrowResult}, which is neither a domain\n` +
        '  refusal nor a success. Re-run once the reserve has liquidity and the broker has cover.',
    )
  }
}
