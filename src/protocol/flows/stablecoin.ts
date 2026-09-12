import type { Client, Wallet } from 'xrpl'
import { submit } from '../lib/submit.js'
import { mptIssuanceIdFromMeta } from '../lib/meta.js'
import { mptAmount, TFEUR_SCALE } from '../lib/mpt.js'
import { loadState, saveState } from '../lib/state.js'

const TF_MPT_CAN_LOCK = 0x00000002
const TF_MPT_CAN_ESCROW = 0x00000008
const TF_MPT_CAN_TRADE = 0x00000010
const TF_MPT_CAN_TRANSFER = 0x00000020

/** Issues the demo stablecoin once and persists its issuance id. Idempotent across
 * `demo.ts` re-runs against the same `state/hackathon.json`. */
export async function issueStablecoin(client: Client, issuer: Wallet): Promise<string> {
  const state = loadState()
  if (state.mptIssuanceId) return state.mptIssuanceId

  const { meta } = await submit(client, issuer, {
    TransactionType: 'MPTokenIssuanceCreate',
    AssetScale: TFEUR_SCALE,
    MaximumAmount: '100000000000',
    Flags: TF_MPT_CAN_TRANSFER | TF_MPT_CAN_ESCROW | TF_MPT_CAN_TRADE | TF_MPT_CAN_LOCK,
    MPTokenMetadata: Buffer.from(JSON.stringify({ ticker: 'TFEUR', name: 'TrustFlow demo EUR' })).toString(
      'hex',
    ),
  })

  const issuanceId = mptIssuanceIdFromMeta(meta)
  state.mptIssuanceId = issuanceId
  saveState(state)
  return issuanceId
}

export async function authorize(client: Client, holder: Wallet, issuanceId: string): Promise<void> {
  await submit(client, holder, {
    TransactionType: 'MPTokenAuthorize',
    MPTokenIssuanceID: issuanceId,
  })
}

export async function payOut(
  client: Client,
  issuer: Wallet,
  destination: Wallet,
  issuanceId: string,
  units: number,
): Promise<void> {
  await submit(client, issuer, {
    TransactionType: 'Payment',
    Destination: destination.classicAddress,
    Amount: mptAmount(issuanceId, units),
  })
}
