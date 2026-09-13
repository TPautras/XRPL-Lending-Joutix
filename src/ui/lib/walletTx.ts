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
 * behind a protection policy do not, and they come through here. `LoanSet` does not — it
 * is dual-signed by borrower and broker, and no wallet holds both keys — so it takes the
 * separate `submitLoanSetFromWallet()` path below instead, which stops after the
 * borrower's signature and hands the blob to `server/loan-signer` for the broker's
 * counter-signature (docs/plans/loanset-signing-service.md).
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

/**
 * XLS-65 and XLS-66 transaction types, plus the one XLS-70 type this app sends. A wallet
 * extension serializes with whatever `ripple-binary-codec` it happens to bundle, and a
 * build published before these amendments cannot encode them at all — the signature fails
 * inside the extension, before the network is ever involved.
 */
const NEW_TX_TYPES = new Set([
  'VaultCreate',
  'VaultDeposit',
  'VaultWithdraw',
  'VaultSet',
  'VaultDelete',
  'LoanBrokerSet',
  'LoanBrokerCoverDeposit',
  'LoanBrokerCoverWithdraw',
  'LoanSet',
  'LoanPay',
  'LoanManage',
  'LoanDelete',
  'CredentialAccept',
])

/**
 * Distinguishes "this wallet has no sign-only method" from "this wallet cannot handle this
 * transaction".
 *
 * Both say "unsupported", and conflating them costs the user a second wallet popup for a
 * transaction that cannot succeed either way — then reports the second failure, which is
 * the less informative of the two. Only a *method* complaint is worth retrying through
 * `signAndSubmit`; a transaction the wallet cannot encode will fail identically there.
 */
export function isMethodUnsupported(err: unknown, transactionType: string): boolean {
  const message = err instanceof Error ? err.message : String(err)
  if (!/not (support|implement)|unsupported|unavailable method/i.test(message)) return false
  // Naming the transaction type, or transaction types in general, makes it the transaction
  // that is unsupported — not the method.
  if (new RegExp(`${transactionType}|transaction type|txn type`, 'i').test(message)) return false
  return true
}

/** Says what a wallet-side signing failure actually means, when we can tell. */
export function explainSigningFailure(err: unknown, transactionType: string): string {
  const message = err instanceof Error ? err.message : String(err)
  if (!NEW_TX_TYPES.has(transactionType)) return message
  if (!/not (support|implement)|unsupported|unknown|invalid|encode|serializ|definition|field/i.test(message)) {
    return message
  }
  return (
    `${message} — ${transactionType} is an XLS-65/66 transaction type, and a wallet extension can only ` +
    'sign what the ripple-binary-codec it ships with knows how to encode. An extension published before ' +
    'those amendments cannot serialize this at all, so the signature fails inside the wallet and never ' +
    'reaches the network. Until the extension ships an updated codec, run this step from src/protocol/ ' +
    '(npm run demo) instead.'
  )
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
  const type = tx.TransactionType

  try {
    const signed = await manager.sign(prepared)
    if (signed?.tx_blob) {
      const response = await client.submitAndWait(signed.tx_blob)
      return {
        hash: response.result.hash,
        result: engineResult(response.result.meta),
        validated: Boolean(response.result.validated),
      }
    }
  } catch (err) {
    if (!isMethodUnsupported(err, type)) {
      throw new WalletSubmitError(explainSigningFailure(err, type))
    }
  }

  const submitted = await manager.signAndSubmit(prepared)
  const hash = submitted?.hash ?? submitted?.id
  if (!hash) throw new WalletSubmitError('The wallet returned no transaction hash')
  return waitForTx(client, hash)
}

interface CountersignResponse {
  resultCode: string
  hash?: string
}

/**
 * `LoanSet`'s browser-side half: autofill against *our* connection (so `Fee` and
 * `Sequence` are fixed before anyone signs, per `docs/snippets/loan-set-dual-sign.ts`),
 * sign with the connected wallet, then hand the signed blob to the loan-signer service
 * for the broker's counter-signature and submission. Deliberately does not fall back to
 * `manager.signAndSubmit()` the way `submitFromWallet` does — that would submit the
 * transaction before the counter-signature exists, which the ledger will simply reject
 * (XLS-66 requires both signatures present at submission), so a wallet that only offers
 * `signAndSubmit()` cannot originate a `LoanSet` at all; surface that plainly instead of
 * masking it as a generic submit failure.
 */
export async function submitLoanSetFromWallet(
  manager: WalletManager,
  client: Client,
  tx: SubmittableTransaction,
  loanSignerUrl: string,
): Promise<WalletSubmitResult> {
  const prepared = await client.autofill(tx)

  let signed: { tx_blob?: string } | undefined
  try {
    signed = await manager.sign(prepared)
  } catch (err) {
    throw new WalletSubmitError(err instanceof Error ? err.message : String(err))
  }
  if (!signed?.tx_blob) {
    throw new WalletSubmitError('This wallet cannot sign without submitting, so it cannot originate a LoanSet')
  }

  const response = await fetch(loanSignerUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tx_blob: signed.tx_blob }),
  })
  const body = (await response.json()) as CountersignResponse
  if (!response.ok && !body.resultCode) {
    throw new WalletSubmitError(`loan-signer service returned ${response.status}`)
  }

  return { hash: body.hash ?? '', result: body.resultCode, validated: body.resultCode === 'tesSUCCESS' }
}
