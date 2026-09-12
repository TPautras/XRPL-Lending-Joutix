import type { Client, Wallet } from 'xrpl'
import { deposit, withdraw } from './vault.js'
import { pay, defaultLoan } from './loan.js'
import { logFriction } from '../lib/friction.js'
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

/** Step 8: an uncredentialed account tries to join a private (gated) vault. */
export async function intruderDeposit(
  client: Client,
  intruder: Wallet,
  vaultId: string,
  issuanceId: string,
  units: number,
): Promise<void> {
  await expectOrLog('VaultDeposit without credential', 'tecNO_AUTH', () =>
    deposit(client, intruder, vaultId, issuanceId, units, 'tecNO_AUTH'),
  )
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
