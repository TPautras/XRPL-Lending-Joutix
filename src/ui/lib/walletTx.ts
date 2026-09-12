import type { Client, SubmittableTransaction, TxResponse } from 'xrpl'
import type { WalletManager } from 'xrpl-connect'

/**
 * Autofill, sign with the connected wallet, submit, wait for validation — the single path
 * every browser submission in this app takes. The Market page proved it out first;
 * `lib/walletActions.ts useWalletSubmit()` now wraps it for the Dashboard and The Gate too.
 *
 * What reaches this function is filtered upstream, by one question: does the transaction
 * need anything beyond the connected account's own signature? `VaultDeposit`,
 * `VaultWithdraw`, `LoanPay`, `LoanBrokerCoverDeposit`, `CredentialAccept` and the escrows
 * behind a protection policy do not, and they come through here. `LoanSet` does — it is
 * dual-signed by borrower and broker, and no wallet holds both keys — so it stays in
 * `src/protocol/`, as do the transactions belonging to the authority and the broker-owner.
 */
export interface WalletSubmitResult {
  hash: string
  /** The raw engine result code — always surfaced, never paraphrased away. */
  result: string
  validated: boolean
}

export class WalletSubmitError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'WalletSubmitError'
  }
}

function engineResult(meta: TxResponse['result']['meta']): string {
  if (typeof meta === 'string') return meta
  return meta?.TransactionResult ?? 'unknown'
}

/** Wallets that cannot sign without submitting say so in different words; anything else
 * (a rejection, a locked wallet) must not be retried through the other path, or the user
 * gets a second popup for a transaction they just refused. */
function isUnsupported(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /not (support|implement)|unsupported|unavailable method/i.test(message)
}

async function waitForTx(client: Client, hash: string, attempts = 8): Promise<WalletSubmitResult> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const { result } = await client.request({ command: 'tx', transaction: hash })
      if (result.validated) {
        return { hash, result: engineResult(result.meta), validated: true }
      }
    } catch {
      // txnNotFound while it propagates — keep waiting rather than reporting a failure.
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  return { hash, result: 'pending', validated: false }
}

/**
 * Autofills against *our* connection, signs with the connected wallet, and submits the
 * blob ourselves.
 *
 * Autofilling here rather than leaving it to the wallet matters twice over: this app talks
 * to a custom devnet the wallet may not have selected, and `EscrowFinish` carrying a
 * fulfillment needs a fee well above base (measured: 423 drops against 12) which xrpl.js
 * computes and most wallet popups do not. `signAndSubmit` is the fallback for wallets that
 * only offer that, and then the wallet's own network is what the transaction lands on.
 */
export async function submitFromWallet(
  manager: WalletManager,
  client: Client,
  tx: SubmittableTransaction,
): Promise<WalletSubmitResult> {
  const prepared = await client.autofill(tx)

  try {
    const signed = await manager.sign(prepared as unknown as Record<string, unknown>)
    if (signed?.tx_blob) {
      const response = await client.submitAndWait(signed.tx_blob)
      return {
        hash: response.result.hash,
        result: engineResult(response.result.meta),
        validated: Boolean(response.result.validated),
      }
    }
  } catch (err) {
    if (!isUnsupported(err)) {
      throw new WalletSubmitError(err instanceof Error ? err.message : String(err))
    }
  }

  const submitted = await manager.signAndSubmit(prepared as unknown as Record<string, unknown>)
  const hash = submitted?.hash ?? submitted?.id
  if (!hash) throw new WalletSubmitError('The wallet returned no transaction hash')
  return waitForTx(client, hash)
}
