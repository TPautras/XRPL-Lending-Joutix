import type { Client, SubmittableTransaction, TxResponse } from 'xrpl'
import type { WalletManager } from 'xrpl-connect'

/**
 * Submitting from the browser — the one place in this app that does.
 *
 * The rest of TrustFlow is read-only on purpose (CLAUDE.md "The webapp"), and the three
 * reasons for that all concern the *protocol*: the browser holds no protocol key, LoanSet
 * needs two signatures, and a visitor holds no Credential so a VaultDeposit from them is
 * refused. None of the three applies to the protection market: a policy is an EscrowCreate
 * over the visitor's own XRP, single-signed, and escrows are not gated by the vault's
 * PermissionedDomain. So this path exists here and nowhere else.
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
