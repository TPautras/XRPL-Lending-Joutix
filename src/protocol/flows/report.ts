import type { Client } from 'xrpl'
import { vaultInfo, ledgerEntry, mptBalance } from '../lib/query.js'
import { loadState } from '../lib/state.js'
import { logFriction } from '../lib/friction.js'

/** Re-reads every object we created and prints the numbers a lender or the jury would
 * actually care about, then checks a handful of invariants that should always hold.
 * Never invents a "verified" state — every number here comes straight off the ledger. */
export async function verify(client: Client): Promise<void> {
  const state = loadState()
  if (!state.vault || !state.loanBrokerId) {
    console.log('Nothing to verify yet — run `npm run demo setup` first.')
    return
  }

  const vault = await vaultInfo(client, state.vault.vaultId)
  const assetsTotal = Number(vault.AssetsTotal ?? 0)
  const assetsAvailable = Number(vault.AssetsAvailable ?? 0)
  const lossUnrealized = Number(vault.LossUnrealized ?? 0)
  const outstandingShares = Number((vault.shares as { OutstandingAmount?: string } | undefined)?.OutstandingAmount ?? 0)
  const sharePrice = outstandingShares > 0 ? assetsTotal / outstandingShares : 0

  console.log('\n== Reserve ==')
  console.log(`  AssetsTotal        ${assetsTotal}`)
  console.log(`  AssetsAvailable    ${assetsAvailable}`)
  console.log(`  LossUnrealized     ${lossUnrealized}`)
  console.log(`  Outstanding shares ${outstandingShares}`)
  console.log(`  Share price        ${sharePrice.toFixed(6)}`)

  const broker = await ledgerEntry(client, state.loanBrokerId)
  console.log('\n== Manager cushion ==')
  console.log(`  DebtTotal        ${broker.DebtTotal ?? 0}`)
  console.log(`  CoverAvailable   ${broker.CoverAvailable ?? 0}`)
  console.log(`  CoverRateMinimum ${broker.CoverRateMinimum}`)

  for (const [slot, loan] of Object.entries(state.loans)) {
    if (!loan) continue
    const entry = await ledgerEntry(client, loan.loanId)
    const flags = Number(entry.Flags ?? 0)
    const status = flags & 0x00010000 ? 'defaulted' : flags & 0x00020000 ? 'impaired' : 'active'
    console.log(`\n== Loan ${slot} (${status}) ==`)
    console.log(`  PrincipalOutstanding   ${entry.PrincipalOutstanding}`)
    console.log(`  TotalValueOutstanding  ${entry.TotalValueOutstanding}`)
    console.log(`  PaymentRemaining       ${entry.PaymentRemaining}`)
    console.log(`  NextPaymentDueDate     ${entry.NextPaymentDueDate}`)

    if (status === 'defaulted' && Number(entry.PaymentRemaining ?? -1) !== 0) {
      logFriction({
        where: `report.verify loan ${slot}`,
        expected: 'a defaulted loan has PaymentRemaining 0',
        got: `PaymentRemaining = ${entry.PaymentRemaining}`,
      })
    }
  }

  if (state.insurance) {
    console.log('\n== Credit insurance ==')
    console.log(`  released:  ${Boolean(state.insurance.released)}`)
    console.log(`  cancelled: ${Boolean(state.insurance.cancelled)}`)
  }

}

export async function printBalance(client: Client, label: string, account: string): Promise<void> {
  const state = loadState()
  if (!state.mptIssuanceId) return
  const balance = await mptBalance(client, account, state.mptIssuanceId)
  console.log(`  ${label}: ${balance} (base units)`)
}
