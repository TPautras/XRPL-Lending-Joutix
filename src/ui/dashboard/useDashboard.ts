import { LedgerEntry, type Client } from 'xrpl'
import type { AppState } from '../lib/appState'
import { useLedgerQuery, type LedgerQuery } from '../lib/ledger'
import { TFEUR_SCALE } from '../lib/format'

export interface VaultView {
  /** Amounts stay exactly as the ledger sent them — integer strings in the funding asset's
   * base units. The only division by 10^scale happens at render (see lib/format.ts). */
  assetsTotal: string
  assetsAvailable: string
  lossUnrealized: string
  outstandingShares: string
  assetScale: number
  shareScale: number
  private: boolean
}

export interface BrokerView {
  debtTotal: string
  debtMaximum: string
  coverAvailable: string
  coverRateMinimum: number
}

export interface LoanView {
  loanId: string
  status: 'active' | 'repaid' | 'impaired' | 'defaulted'
  principalOutstanding: string
  totalValueOutstanding: string
  periodicPayment: string
  paymentRemaining: number
  nextPaymentDueDate: number
  gracePeriod: number
}

export interface DashboardData {
  vault: VaultView | null
  broker: BrokerView | null
  loans: Record<'A' | 'B', LoanView | null>
}

/**
 * xrpl.js 5.2.0 types all of this: `vault_info` is in the request union and `Loan`,
 * `LoanBroker`, `Vault`, `LoanFlags` and `VaultFlags` are exported ledger models. So every
 * read here is narrowed on `LedgerEntryType` rather than cast — the compiler, not a comment,
 * is what guarantees `DebtTotal` is being read off a `LoanBroker`.
 */
async function readVault(client: Client, vaultId: string): Promise<VaultView> {
  const { result } = await client.request({ command: 'vault_info', vault_id: vaultId })
  const vault = result.vault
  return {
    assetsTotal: String(vault.AssetsTotal ?? '0'),
    assetsAvailable: String(vault.AssetsAvailable ?? '0'),
    lossUnrealized: String(vault.LossUnrealized ?? '0'),
    outstandingShares: String(vault.shares.OutstandingAmount ?? '0'),
    // The reserve is denominated in TFEUR by construction (`VaultCreate` was given that
    // MPT as its `Asset`), so its scale is the stablecoin's.
    assetScale: TFEUR_SCALE,
    // The share MPT is created by `VaultCreate` and carries its own `AssetScale`; reading
    // it rather than assuming the two match keeps the share price honest either way.
    shareScale: Number(vault.shares.AssetScale ?? TFEUR_SCALE),
    // Read off the ledger rather than from state.json: whether the vault is domain-gated
    // is a fact about the object, not about what we meant to create.
    private: (vault.Flags & LedgerEntry.VaultFlags.lsfVaultPrivate) !== 0,
  }
}

async function readNode(client: Client, index: string) {
  const { result } = await client.request({ command: 'ledger_entry', index, ledger_index: 'validated' })
  return result.node
}

async function readBroker(client: Client, brokerId: string): Promise<BrokerView> {
  const node = await readNode(client, brokerId)
  if (node.LedgerEntryType !== 'LoanBroker') throw new Error(`${brokerId} is a ${node.LedgerEntryType}`)
  const broker: LedgerEntry.LoanBroker = node
  return {
    debtTotal: String(broker.DebtTotal ?? '0'),
    debtMaximum: String(broker.DebtMaximum ?? '0'),
    coverAvailable: String(broker.CoverAvailable ?? '0'),
    coverRateMinimum: Number(broker.CoverRateMinimum ?? 0),
  }
}

/**
 * A `Loan` omits every field sitting at its zero value, so a fully repaid loan comes back
 * with no `PrincipalOutstanding`, no `TotalValueOutstanding`, no `PaymentRemaining` and no
 * `NextPaymentDueDate` — only `PreviousPaymentDueDate` survives. There is no flag for
 * "repaid" either: `Flags` is plainly `0`, the same as a loan that has not been touched.
 * So the absence *is* the signal, and reading it as `active` puts "Active · 0 payment(s)
 * left · Outstanding €0.00" on screen, three statements that contradict each other.
 */
async function readLoan(client: Client, loanId: string): Promise<LoanView> {
  const node = await readNode(client, loanId)
  if (node.LedgerEntryType !== 'Loan') throw new Error(`${loanId} is a ${node.LedgerEntryType}`)
  const loan: LedgerEntry.Loan = node
  const paymentRemaining = Number(loan.PaymentRemaining ?? 0)
  const principalOutstanding = String(loan.PrincipalOutstanding ?? '0')
  return {
    loanId,
    status:
      loan.Flags & LedgerEntry.LoanFlags.lsfLoanDefault
        ? 'defaulted'
        : loan.Flags & LedgerEntry.LoanFlags.lsfLoanImpaired
          ? 'impaired'
          : paymentRemaining === 0 && principalOutstanding === '0'
            ? 'repaid'
            : 'active',
    principalOutstanding,
    totalValueOutstanding: String(loan.TotalValueOutstanding ?? '0'),
    periodicPayment: String(loan.PeriodicPayment ?? '0'),
    paymentRemaining,
    nextPaymentDueDate: Number(loan.NextPaymentDueDate ?? 0),
    gracePeriod: Number(loan.GracePeriod ?? 0),
  }
}

/**
 * The whole reserve, re-read on every ledger close. Each object is fetched independently and
 * a failure is swallowed per object on purpose: during the demo the broker exists before the
 * loans do, and one missing object must not take the rest of the screen with it.
 */
export function useDashboard(state: AppState | null): LedgerQuery<DashboardData> {
  const vaultId = state?.vault?.vaultId
  const brokerId = state?.loanBrokerId
  const loanA = state?.loans?.A?.loanId
  const loanB = state?.loans?.B?.loanId

  return useLedgerQuery<DashboardData>(
    !state
      ? null
      : async (client) => {
          const [vault, broker, a, b] = await Promise.all([
            vaultId ? readVault(client, vaultId).catch(() => null) : null,
            brokerId ? readBroker(client, brokerId).catch(() => null) : null,
            loanA ? readLoan(client, loanA).catch(() => null) : null,
            loanB ? readLoan(client, loanB).catch(() => null) : null,
          ])
          return { vault, broker, loans: { A: a, B: b } }
        },
    [vaultId, brokerId, loanA, loanB],
  )
}
