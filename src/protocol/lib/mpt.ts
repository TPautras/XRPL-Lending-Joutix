/** TFEUR demo stablecoin: 1 unit = 10^-2, i.e. balances are in cents. Must match the
 * `AssetScale` passed to `MPTokenIssuanceCreate` in flows/stablecoin.ts. */
export const TFEUR_SCALE = 2

/** MPTAmount.value (Payment, VaultDeposit/Withdraw, LoanPay, EscrowCreate amounts) is
 * always an INTEGER in base units, regardless of AssetScale — AssetScale only affects
 * how a value is displayed, never how it's transmitted. This is a real seam: it's easy
 * to assume AssetScale means "divide by 100 automatically" and it doesn't. */
export function mptBaseUnits(units: number): string {
  return Math.round(units * 10 ** TFEUR_SCALE).toString()
}

export function mptAmount(issuanceId: string, units: number): { mpt_issuance_id: string; value: string } {
  return { mpt_issuance_id: issuanceId, value: mptBaseUnits(units) }
}

/** Ledger-internal "Number" fields (PrincipalRequested, DebtMaximum, AssetsTotal, ...)
 * are a self-describing decimal type and are NOT pre-scaled by AssetScale — unlike
 * MPTAmount.value above. Passing the real magnitude as a plain string is the working
 * assumption; flows/loan.ts reads the Loan object back after LoanSet specifically to
 * confirm this against the live ledger, since it is undocumented which convention
 * applies where and getting it wrong by 100x is an easy, silent mistake. */
export function numberField(units: number): string {
  return String(units)
}
