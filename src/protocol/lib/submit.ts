import type { Client, SubmittableTransaction, Wallet } from 'xrpl'
import { NETWORK } from './env.js'

export interface SubmitResult {
  hash: string
  resultCode: string
  meta: unknown
}

/** Autofills, signs and submits `tx` as `wallet`, waits for validation, prints the
 * engine result and an explorer link. Throws unless the result matches `expect`
 * (default `tesSUCCESS`) — friction that must never be swallowed silently. */
export async function submit(
  client: Client,
  wallet: Wallet,
  tx: Record<string, unknown>,
  opts: { expect?: string } = {},
): Promise<SubmitResult> {
  // `autofill()` needs `Account` set to look up the sequence/reserve via `account_info`
  // — it does not infer it from `wallet`. Default it here so call sites that submit as
  // the obvious signer (nearly all of them) don't have to repeat it.
  const withAccount = { Account: wallet.classicAddress, ...tx }
  const prepared = await client.autofill(withAccount as unknown as SubmittableTransaction)
  const signed = wallet.sign(prepared)
  return finish(client, signed.tx_blob, String(tx.TransactionType), opts.expect)
}

/** For transactions assembled outside `submit()` — currently only the dual-signed
 * `LoanSet` blob produced by `sme.sign()` + `signLoanSetByCounterparty()`. */
export async function submitBlob(
  client: Client,
  txBlob: string,
  txType: string,
  expect?: string,
): Promise<SubmitResult> {
  return finish(client, txBlob, txType, expect)
}

async function finish(
  client: Client,
  txBlob: string,
  txType: string,
  expect: string | undefined,
): Promise<SubmitResult> {
  const response = await client.submitAndWait(txBlob)
  const meta = response.result.meta
  const resultCode =
    meta && typeof meta === 'object' && 'TransactionResult' in meta
      ? String((meta as { TransactionResult: string }).TransactionResult)
      : 'unknown'
  const hash = response.result.hash ?? ''
  const wantCode = expect ?? 'tesSUCCESS'
  const ok = resultCode === wantCode
  const link = `${NETWORK.explorer}/transactions/${hash}`
  const mark = ok ? '✓' : '✗'
  const expectNote = expect ? ` (expected ${expect})` : ''
  console.log(`${mark} ${txType} -> ${resultCode}${expectNote}  ${link}`)
  if (!ok) {
    throw new Error(`${txType} returned ${resultCode}, expected ${wantCode} -- ${link}`)
  }
  return { hash, resultCode, meta }
}
