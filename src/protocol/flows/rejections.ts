import type { Client, Wallet } from 'xrpl'
import { deposit, withdraw } from './vault.js'
import { pay, defaultLoan } from './loan.js'
import { issueCredential, revokeCredential } from './credentials.js'
import { logFriction } from '../lib/friction.js'
import { vaultInfo, mptBalance } from '../lib/query.js'
import { mptBaseUnits } from '../lib/mpt.js'
import * as stablecoin from './stablecoin.js'
import type { LoanState } from '../lib/state.js'

/** Each function submits a transaction expected to fail with a specific protocol
 * guardrail. If the actual code differs from the expectation, `submit()` throws —
 * these wrappers catch that specific mismatch and log it as friction instead of
 * crashing the whole demo, since "the guardrail fired, just with a different code"
 * is exactly the kind of thing worth reporting, not a bug in the demo script. */
async function expectOrLog(where: string, expected: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const match = /returned (\w+),/.exec(message)
    logFriction({
      where,
      expected: `rejected with ${expected}`,
      got: match ? `rejected with ${match[1]}` : message,
    })
  }
}

/** Step 7: investorB tries to withdraw more than the reserve holds available. */
export async function overWithdraw(
  client: Client,
  investorB: Wallet,
  vaultId: string,
  issuanceId: string,
  units: number,
): Promise<void> {
  await expectOrLog('VaultWithdraw over available liquidity', 'tecINSUFFICIENT_FUNDS', () =>
    withdraw(client, investorB, vaultId, issuanceId, units, 'tecINSUFFICIENT_FUNDS'),
  )
}

/**
 * Step 8: an uncredentialed account tries to join a private (gated) vault.
 *
 * Funds the intruder first, on purpose. XLS-65 §3.5.2.2 evaluates the permissioned-domain
 * check (#6) before the balance check (#9), so a broke account would be refused
 * `tecNO_AUTH` anyway — but "it was refused because it has no credential" is a much
 * harder claim to argue with when the account visibly holds more than it is trying to
 * deposit. On stage the difference between those two demos is the whole point.
 */
export async function intruderDeposit(
  client: Client,
  issuer: Wallet,
  intruder: Wallet,
  vaultId: string,
  issuanceId: string,
  units: number,
): Promise<void> {
  const balance = Number(await mptBalance(client, intruder.classicAddress, issuanceId))
  if (balance < Number(mptBaseUnits(units))) {
    await stablecoin.payOut(client, issuer, intruder, issuanceId, units * 2)
  }
  console.log(
    `  intruder holds ${await mptBalance(client, intruder.classicAddress, issuanceId)} base units ` +
      `and is trying to deposit ${mptBaseUnits(units)} — the only thing it lacks is the credential`,
  )
  await expectOrLog('VaultDeposit without credential', 'tecNO_AUTH', () =>
    deposit(client, intruder, vaultId, issuanceId, units, 'tecNO_AUTH'),
  )
}

/**
 * Step 8b, and the compliance design choice CLAUDE.md asks to be stated out loud: an
 * investor who loses their credential is refused on the way *in* and still served on the
 * way *out*.
 *
 * This is not TrustFlow being generous — XLS-65 §7 says `VaultWithdraw` deliberately does
 * not respect permissioned-domain rules, "to avoid a situation where a depositor deposits
 * assets to a private vault to then have their access revoked by invalidating their
 * credentials, and thus loosing access to their funds". Revocation stands in for expiry
 * here because it is instantaneous; the resulting domain-membership state is identical.
 *
 * The credential is re-issued at the end so the step is idempotent and the rest of the
 * demo (s10's withdrawal) still runs against a credentialed investor.
 */
export async function revokedStillWithdraws(
  client: Client,
  authority: Wallet,
  investor: Wallet,
  vaultId: string,
  issuanceId: string,
  units: number,
): Promise<void> {
  console.log('\n  revoking the investor\'s compliance credential...')
  await revokeCredential(client, authority, investor)

  await expectOrLog('VaultDeposit after credential revocation', 'tecNO_AUTH', () =>
    deposit(client, investor, vaultId, issuanceId, units, 'tecNO_AUTH'),
  )

  // Never let a thin reserve turn into a false "withdrawals are broken too" on stage:
  // an under-funded vault would return tecINSUFFICIENT_FUNDS, which proves nothing about
  // the gate. Shrink to what is actually available and say so.
  const vault = await vaultInfo(client, vaultId)
  const available = Number(vault.AssetsAvailable ?? 0)
  const wanted = Number(mptBaseUnits(units))
  let amount = units
  if (available < wanted) {
    amount = Math.floor(available / 100) // back to display units at AssetScale 2
    console.log(
      `  reserve only has ${available} base units available; withdrawing ${amount} TFEUR instead ` +
        'so the result reflects the gate and not the liquidity',
    )
  }

  if (amount > 0) {
    console.log('  ...and withdrawing anyway, with no credential:')
    await withdraw(client, investor, vaultId, issuanceId, amount)
  } else {
    logFriction({
      where: 'revokedStillWithdraws',
      expected: 'enough available liquidity to demonstrate an ungated withdrawal',
      got: `Vault.AssetsAvailable = ${available} base units`,
      note: 'Deposit into the reserve before running this step; the withdrawal half was skipped.',
    })
  }

  console.log('  restoring the credential so the rest of the demo runs normally.')
  await issueCredential(client, authority, investor)
}

/** Bonus rejection: paying late without acknowledging it via `tfLoanLatePayment`. */
export async function latePayNoFlag(
  client: Client,
  sme: Wallet,
  loan: LoanState,
  issuanceId: string,
): Promise<void> {
  await expectOrLog('LoanPay after due date without tfLoanLatePayment', 'tecEXPIRED', () =>
    pay(client, sme, loan, issuanceId, { late: false }),
  )
}

/** Bonus rejection: defaulting a loan before its grace period has actually expired. */
export async function earlyDefault(client: Client, manager: Wallet, loan: LoanState): Promise<void> {
  await expectOrLog('LoanManage tfLoanDefault before grace period expiry', 'tecTOO_SOON', () =>
    defaultLoan(client, manager, loan, 'tecTOO_SOON'),
  )
}
