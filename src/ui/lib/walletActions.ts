import { useCallback, useState } from 'react'
import { LedgerEntry, type Client, type SubmittableTransaction } from 'xrpl'
import { useLedger, useLedgerQuery, type LedgerQuery } from './ledger'
import { submitFromWallet, submitLoanSetFromWallet } from './walletTx'
import { LOAN_SIGNER_URL } from './network'
import { appendWalletLog, readWalletLog, type LocalTx } from './walletLog'
import { useWallet } from '../wallet/WalletContext'

/**
 * Single-signer TrustFlow actions a connected wallet can submit directly. `VaultDeposit`,
 * `VaultWithdraw`, `LoanPay`, `LoanBrokerCoverDeposit` and `CredentialAccept` each need
 * only the connected account's own signature, so Dashboard and The Gate submit them the
 * same way Market already submits `EscrowCreate`/`EscrowFinish`/`EscrowCancel`. `LoanSet`
 * is dual-signed (borrower + broker) — `useLoanSetSubmit()` below signs it with the
 * connected wallet and hands it to the `server/loan-signer` service for the broker's
 * counter-signature (docs/plans/loanset-signing-service.md), instead of submitting it
 * directly the way `useWalletSubmit()` does.
 */

async function mptBalanceOf(client: Client, account: string, issuanceId: string): Promise<string> {
  try {
    const { result } = await client.request({ command: 'account_objects', account, type: 'mptoken' })
    // Same cast as GatePage's local helper: `MPToken` is missing from xrpl.js 5.2.0's
    // `LedgerEntry` union even though `account_objects` accepts it as a type filter
    // (FEEDBACK_REPORT.md §9).
    const objects = result.account_objects as unknown as LedgerEntry.MPToken[]
    const held = objects.find(
      (object) => object.LedgerEntryType === 'MPToken' && object.MPTokenIssuanceID === issuanceId,
    )
    return held?.MPTAmount ?? '0'
  } catch {
    // Account not on the ledger yet, or holds no MPT at all — report zero, not an error.
    return '0'
  }
}

export function useMptBalance(address: string | null, issuanceId: string | undefined): LedgerQuery<string> {
  return useLedgerQuery<string>(
    !address || !issuanceId ? null : (client) => mptBalanceOf(client, address, issuanceId),
    [address, issuanceId],
  )
}

/**
 * What the connected account's vault shares are worth right now, base units — the same
 * math as `flows/vault.ts withdrawMax()`, since re-requesting a face-value deposit amount
 * after share price has moved returns `tecINSUFFICIENT_FUNDS` (docs/FRICTION.md). All
 * BigInt, matching CLAUDE.md's "never do float math on ledger amounts".
 */
export function useRedeemable(
  address: string | null,
  vaultId: string | undefined,
  shareMptId: string | undefined,
): LedgerQuery<string> {
  return useLedgerQuery<string>(
    !address || !vaultId || !shareMptId
      ? null
      : async (client) => {
          const { result } = await client.request({ command: 'vault_info', vault_id: vaultId })
          const assetsTotal = BigInt(String(result.vault.AssetsTotal ?? '0'))
          const outstandingShares = BigInt(String(result.vault.shares.OutstandingAmount ?? '0'))
          const sharesOwned = BigInt(await mptBalanceOf(client, address, shareMptId))
          const redeemable = outstandingShares > 0n ? (sharesOwned * assetsTotal) / outstandingShares : 0n
          return redeemable.toString()
        },
    [address, vaultId, shareMptId],
  )
}

export interface WalletSubmit {
  /** The `TransactionType` currently in flight, or null when idle — use to disable one
   * button at a time without disabling the whole page. */
  pending: string | null
  error: string | null
  clearError: () => void
  log: LocalTx[]
  send: (tx: SubmittableTransaction, note?: string) => Promise<void>
}

/**
 * The submit/pending/error/log state machine Market's page proved out, generalized so
 * Dashboard and The Gate don't each reimplement it. One instance per page — every button
 * on that page shares the same `pending`/`error`, which is the point: a visitor should
 * not fire a second transaction while the first is still waiting on their wallet.
 */
export function useWalletSubmit(): WalletSubmit {
  const { walletManager, account } = useWallet()
  const { client } = useLedger()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<LocalTx[]>(() => readWalletLog())

  const send = useCallback(
    async (tx: SubmittableTransaction, note?: string) => {
      if (!walletManager || !account) return
      setPending(tx.TransactionType)
      setError(null)
      try {
        const outcome = await submitFromWallet(walletManager, client, tx)
        setLog(
          appendWalletLog({
            ts: new Date().toISOString(),
            type: tx.TransactionType,
            result: outcome.result,
            hash: outcome.hash,
            note,
          }),
        )
        // The raw engine code is the signal (CLAUDE.md rules): a tec* outcome is shown as
        // plainly as a thrown error rather than reported as success.
        if (outcome.result !== 'tesSUCCESS') setError(`${tx.TransactionType} → ${outcome.result}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setPending(null)
      }
    },
    [walletManager, account, client],
  )

  return { pending, error, clearError: () => setError(null), log, send }
}

/**
 * `LoanSet`'s counterpart to `useWalletSubmit()`. Same pending/error/log shape, so a
 * caller renders it identically — the difference is entirely inside `send`, which stops
 * after the borrower's own signature and lets `server/loan-signer` apply the broker's
 * counter-signature and submit (docs/plans/loanset-signing-service.md).
 */
export function useLoanSetSubmit(): WalletSubmit {
  const { walletManager, account } = useWallet()
  const { client } = useLedger()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<LocalTx[]>(() => readWalletLog())

  const send = useCallback(
    async (tx: SubmittableTransaction, note?: string) => {
      if (!walletManager || !account) return
      setPending(tx.TransactionType)
      setError(null)
      try {
        const outcome = await submitLoanSetFromWallet(walletManager, client, tx, LOAN_SIGNER_URL)
        setLog(
          appendWalletLog({
            ts: new Date().toISOString(),
            type: tx.TransactionType,
            result: outcome.result,
            hash: outcome.hash,
            note,
          }),
        )
        if (outcome.result !== 'tesSUCCESS') setError(`${tx.TransactionType} → ${outcome.result}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setPending(null)
      }
    },
    [walletManager, account, client],
  )

  return { pending, error, clearError: () => setError(null), log, send }
}
