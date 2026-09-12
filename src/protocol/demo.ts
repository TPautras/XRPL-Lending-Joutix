/**
 * TrustFlow step runner. `npx tsx src/protocol/demo.ts <command>`.
 *
 * Commands:
 *   setup     one-time: stablecoin, credentials domain, private vault, broker (no cover yet)
 *   gate      Phase 2 evidence: walks one account through every credential state and
 *             records what the ledger answers, including the uncredentialed-borrower probe
 *   oracle    optional: manager publishes an XLS-47 Price Oracle valuing the financed
 *             receivable (see flows/oracle.ts) -- informational, not consulted by LoanSet
 *   referee   publishes the open protection market's conditions and reveals the fulfillment
 *             for any loan the ledger says has defaulted. Idempotent — safe to re-run or
 *             loop while the market is open (see src/ui/pages/MarketPage.tsx)
 *   prestage  run ~5 min before going on stage: cover, loan B (the one that will default),
 *             sell protection on it. Prints when it becomes defaultable.
 *   s1..s10   the on-stage steps, matching CLAUDE.md's numbered demo script
 *   full      setup + prestage (with the real wait) + s1..s10 — for end-to-end rehearsal
 *   verify    re-read every object and print/check invariants
 *   reset     wipe state/hackathon.json (accounts and the stablecoin issuance are reused
 *             next time `setup` runs against them again — nothing here re-funds XRP)
 */
import { getClient, disconnectClient } from './lib/client.js'
import { loadWallets, ROLE_NAMES } from './lib/env.js'
import { loadState, resetState, recordAccounts, recordGate } from './lib/state.js'
import { waitUntilRippleTime } from './lib/time.js'
import * as stablecoin from './flows/stablecoin.js'
import { createDomain } from './flows/domain.js'
import { issueCredential } from './flows/credentials.js'
import { createVault, deposit, withdrawMax } from './flows/vault.js'
import { createBroker, depositCover } from './flows/broker.js'
import { originate, pay, impair, defaultLoan, type LoanTerms } from './flows/loan.js'
import { sellProtection, payPremium, payoutProtection } from './flows/insurance.js'
import { overWithdraw, intruderDeposit, revokedStillWithdraws } from './flows/rejections.js'
import { proveGate } from './flows/gate.js'
import { publishReceivablePrice } from './flows/oracle.js'
import { publishConditions, revealDefaulted, describeMarket } from './flows/market.js'
import { verify } from './flows/report.js'

const LOAN_A: LoanTerms = { principal: 2000, interestRate: 100000, paymentTotal: 1, paymentInterval: 60, gracePeriod: 60 }
const LOAN_B: LoanTerms = { principal: 3000, interestRate: 100000, paymentTotal: 3, paymentInterval: 120, gracePeriod: 60 }
const INSURANCE_COVERED_UNITS = 2500
const INSURANCE_PREMIUM_UNITS = 150
const INSURANCE_CANCEL_AFTER_SECONDS = 45 * 60

async function cmdSetup() {
  const client = await getClient()
  const w = loadWallets()

  const issuanceId = await stablecoin.issueStablecoin(client, w.issuer)
  for (const role of ['manager', 'sme', 'smeUncredentialed', 'investorA', 'investorB', 'insurer'] as const) {
    await stablecoin.authorize(client, w[role], issuanceId)
  }
  await stablecoin.payOut(client, w.issuer, w.investorA, issuanceId, 100_000)
  await stablecoin.payOut(client, w.issuer, w.investorB, issuanceId, 100_000)
  await stablecoin.payOut(client, w.issuer, w.manager, issuanceId, 5_000)
  await stablecoin.payOut(client, w.issuer, w.insurer, issuanceId, 50_000)
  // The intruder is funded on purpose: its rejection in s8 has to be about the missing
  // credential and nothing else. See flows/rejections.ts intruderDeposit().
  await stablecoin.payOut(client, w.issuer, w.smeUncredentialed, issuanceId, 5_000)

  const domainId = await createDomain(client, w.manager, w.authority)
  const { vaultId } = await createVault(client, w.manager, issuanceId, { domainId })
  await createBroker(client, w.manager, vaultId)

  console.log('\nSetup complete. Next: `npm run demo prestage`.')
}

/** NOTE — ordering: Loan B's principal comes out of the vault, so `s1` (credentials)
 * and `s2` (investor deposits) must already have landed when this runs. Against a
 * fresh `setup` the vault is empty and `LoanSet` returns `tecINSUFFICIENT_FUNDS`
 * (reproduced 2026-09-12, tx 3D7A4835…0DE44). Run `s1` and `s2` before `prestage`,
 * and treat the on-stage `s2` as a second, visible deposit. */
async function cmdPrestage() {
  const client = await getClient()
  const w = loadWallets()
  const state = loadState()
  if (!state.vault || !state.loanBrokerId || !state.mptIssuanceId) {
    throw new Error('Run `npm run demo setup` first.')
  }

  await depositCover(client, w.manager, state.loanBrokerId, state.mptIssuanceId, 1_500)
  const loanB = await originate(client, w.sme, w.manager, state.loanBrokerId, 'B', LOAN_B)
  await sellProtection(client, w.insurer, w.investorA, state.mptIssuanceId, INSURANCE_COVERED_UNITS, INSURANCE_CANCEL_AFTER_SECONDS)

  const defaultableAt = loanB.startDate + loanB.paymentInterval + loanB.gracePeriod
  console.log(`\nLoan B defaultable once ledger time passes ${defaultableAt} (in ~${loanB.paymentInterval + loanB.gracePeriod}s).`)
  console.log('Go on stage now; run `npm run demo s9` once that has elapsed.')
}

/** Optional, time-permitting per CLAUDE.md's architecture table: the manager
 * publishes its valuation of the receivable currently financed as an XLS-47 Price
 * Oracle. Not part of `s1`..`s10` — the numbered demo script is already verified
 * end to end and this adds no dependency on it, so it stays a standalone command,
 * same as `gate`. */
async function cmdOracle() {
  const client = await getClient()
  const w = loadWallets()
  await publishReceivablePrice(client, w.manager, {
    baseAsset: 'TFEUR',
    quoteAsset: 'XRP',
    price: 0.5,
    scale: 2,
  })
}

async function cmdStep(step: string) {
  const client = await getClient()
  const w = loadWallets()
  const state = loadState()
  const issuanceId = state.mptIssuanceId
  const vaultId = state.vault?.vaultId
  const loanBrokerId = state.loanBrokerId
  if (!issuanceId || !vaultId || !loanBrokerId) throw new Error('Run `npm run demo setup` first.')

  switch (step) {
    case 's1':
      for (const role of ['manager', 'sme', 'investorA', 'investorB', 'insurer'] as const) {
        await issueCredential(client, w.authority, w[role])
      }
      break

    case 's2':
      await deposit(client, w.investorA, vaultId, issuanceId, 20_000)
      await deposit(client, w.investorB, vaultId, issuanceId, 15_000)
      break

    case 's3':
      await depositCover(client, w.manager, loanBrokerId, issuanceId, 500)
      break

    case 's4':
      await originate(client, w.sme, w.manager, loanBrokerId, 'A', LOAN_A)
      break

    case 's5':
      await payPremium(client, w.investorA, w.insurer, issuanceId, INSURANCE_PREMIUM_UNITS)
      break

    case 's6': {
      const loanA = loadState().loans.A
      if (!loanA) throw new Error('Loan A not originated yet — run s4 first.')
      await pay(client, w.sme, loanA, issuanceId, { full: true })
      break
    }

    case 's7':
      await overWithdraw(client, w.investorB, vaultId, issuanceId, 200_000)
      break

    case 's8':
      // Two beats, both required by CLAUDE.md's "the gate": the door is shut to an
      // uncredentialed account, and it is deliberately not shut on the way out.
      await intruderDeposit(client, w.issuer, w.smeUncredentialed, vaultId, issuanceId, 1_000)
      await revokedStillWithdraws(client, w.authority, w.investorB, vaultId, issuanceId, 100)
      break

    case 's9': {
      const loanB = loadState().loans.B
      if (!loanB) throw new Error('Loan B not originated yet — run `prestage` first.')
      await impair(client, w.manager, loanB)
      await defaultLoan(client, w.manager, loanB)
      await payoutProtection(client, w.manager)
      // The demo's own policy is settled above; every policy strangers wrote against the
      // same loan in the open market settles by the referee publishing the fulfillment.
      await revealDefaulted(client)
      break
    }

    case 's10': {
      // Redeem what the shares are actually worth now, not the face value deposited —
      // a default the cushion didn't fully absorb can drop the share price below 1.
      // See withdrawMax() in flows/vault.ts and docs/FRICTION.md.
      const shareMptId = state.vault!.shareMptId
      await withdrawMax(client, w.investorA, vaultId, shareMptId, issuanceId)
      await withdrawMax(client, w.investorB, vaultId, shareMptId, issuanceId)
      break
    }

    default:
      throw new Error(`Unknown step ${step}`)
  }
}

async function cmdFull() {
  await cmdSetup()
  const client = await getClient()
  const w = loadWallets()

  // Credentials and the investor deposits have to land before Loan B is originated:
  // the loan draws its principal from the vault, and a vault nobody has deposited into
  // answers LoanSet with tecINSUFFICIENT_FUNDS. `prestage` has the same ordering
  // requirement against a live stage — see the note on cmdPrestage().
  for (const step of ['s1', 's2'] as const) await cmdStep(step)

  const state = loadState()
  await depositCover(client, w.manager, state.loanBrokerId!, state.mptIssuanceId!, 1_500)
  const loanB = await originate(client, w.sme, w.manager, state.loanBrokerId!, 'B', LOAN_B)
  await sellProtection(client, w.insurer, w.investorA, state.mptIssuanceId!, INSURANCE_COVERED_UNITS, INSURANCE_CANCEL_AFTER_SECONDS)

  for (const step of ['s3', 's4', 's5', 's6', 's7', 's8'] as const) await cmdStep(step)

  const defaultableAt = loanB.startDate + loanB.paymentInterval + loanB.gracePeriod
  await waitUntilRippleTime(client, defaultableAt)
  await cmdStep('s9')
  await cmdStep('s10')
  await verify(client)
}

async function main() {
  const command = process.argv[2]
  if (!command) {
    console.error('Usage: npm run demo <setup|prestage|s1..s10|gate|oracle|referee|full|verify|reset>')
    process.exitCode = 1
    return
  }

  if (command === 'reset') {
    resetState()
    console.log('state/hackathon.json reset.')
    return
  }

  // Every command writes the role addresses out first: the webapp's Gate page reads
  // them from state.json (it has no access to .env), and they are the one fact it needs
  // that no ledger query can supply.
  const roleAddresses = loadWallets()
  recordAccounts(Object.fromEntries(ROLE_NAMES.map((role) => [role, roleAddresses[role].classicAddress])))

  if (command === 'setup') await cmdSetup()
  else if (command === 'prestage') await cmdPrestage()
  else if (command === 'gate') recordGate(await proveGate(await getClient(), loadWallets()))
  else if (command === 'oracle') await cmdOracle()
  else if (command === 'referee') {
    await publishConditions(await getClient(), loadWallets().manager)
    describeMarket()
  }
  else if (command === 'verify') await verify(await getClient())
  else if (command === 'full') await cmdFull()
  else if (/^s([1-9]|10)$/.test(command)) await cmdStep(command)
  else {
    console.error(`Unknown command: ${command}`)
    process.exitCode = 1
  }

  await disconnectClient()
}

// The `.finally` is load-bearing: on the throw path `main()`'s own disconnect is
// skipped, the WebSocket stays open, and the process hangs forever on a failed step
// instead of exiting with the error it just printed.
main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => disconnectClient())
