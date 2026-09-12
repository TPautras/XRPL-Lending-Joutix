import type { Client, Wallet } from 'xrpl'
import { submit } from '../lib/submit.js'
import { createdNode } from '../lib/meta.js'
import { mptAmount } from '../lib/mpt.js'
import { loadState, saveState } from '../lib/state.js'

/** Rates are 1/10th basis point: 10000 = 10.000%, 100000 = 100.000%. */
export const COVER_RATE_MINIMUM = 10000 // manager must keep >= 10% of debt as first-loss cover
export const COVER_RATE_LIQUIDATION = 100000 // 100% of the minimum cover is usable on default
export const MANAGEMENT_FEE_RATE = 500 // 0.5%, deducted from interest before it reaches lenders

export async function createBroker(client: Client, manager: Wallet, vaultId: string): Promise<string> {
  const state = loadState()
  if (state.loanBrokerId) return state.loanBrokerId

  const { meta } = await submit(client, manager, {
    TransactionType: 'LoanBrokerSet',
    VaultID: vaultId,
    ManagementFeeRate: MANAGEMENT_FEE_RATE,
    CoverRateMinimum: COVER_RATE_MINIMUM,
    CoverRateLiquidation: COVER_RATE_LIQUIDATION,
    DebtMaximum: '0', // 0 = unlimited
  })

  const { index } = createdNode(meta, 'LoanBroker')
  state.loanBrokerId = index
  saveState(state)
  return index
}

/** First-loss capital. Must stay >= (DebtTotal + new principal + interest due) x
 * CoverRateMinimum or `LoanSet`/further lending fails `tecINSUFFICIENT_FUNDS` — size
 * this deposit for the total principal you plan to originate across both demo loans. */
export async function depositCover(
  client: Client,
  manager: Wallet,
  loanBrokerId: string,
  issuanceId: string,
  units: number,
): Promise<void> {
  await submit(client, manager, {
    TransactionType: 'LoanBrokerCoverDeposit',
    LoanBrokerID: loanBrokerId,
    Amount: mptAmount(issuanceId, units),
  })
}
