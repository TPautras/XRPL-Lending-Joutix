import type { Client, Wallet } from 'xrpl'
import { submit, type SubmitResult } from '../lib/submit.js'
import { createdNode } from '../lib/meta.js'
import { mptAmount } from '../lib/mpt.js'
import { vaultInfo, mptBalance } from '../lib/query.js'
import { loadState, saveState } from '../lib/state.js'

const TF_VAULT_PRIVATE = 0x00010000

export interface VaultIds {
  vaultId: string
  shareMptId: string
}

/** The shared reserve. Private (credential-gated) when `domainId` is given — see
 * CLAUDE.md: withdrawal is deliberately NOT gated by the domain (that's a ledger-level
 * guarantee, `VaultWithdraw` never checks `DomainID`), only deposit is. */
export async function createVault(
  client: Client,
  manager: Wallet,
  issuanceId: string,
  opts: { domainId?: string } = {},
): Promise<VaultIds> {
  const state = loadState()
  if (state.vault) return { vaultId: state.vault.vaultId, shareMptId: state.vault.shareMptId }

  const tx: Record<string, unknown> = {
    TransactionType: 'VaultCreate',
    Asset: { mpt_issuance_id: issuanceId },
    WithdrawalPolicy: 1, // vaultStrategyFirstComeFirstServe — the only value defined today
    Data: Buffer.from('TrustFlow reserve').toString('hex').toUpperCase(),
  }
  if (opts.domainId) {
    tx.DomainID = opts.domainId
    tx.Flags = TF_VAULT_PRIVATE
  }

  const { meta } = await submit(client, manager, tx)
  const { index, fields } = createdNode(meta, 'Vault')
  const shareMptId = String(fields.ShareMPTID)

  state.vault = { vaultId: index, shareMptId, private: Boolean(opts.domainId) }
  saveState(state)
  return { vaultId: index, shareMptId }
}

/** `record` returns whatever the ledger answered instead of asserting it — used only by
 * the gate probes in flows/gate.ts, where the answer is the experiment. */
export async function deposit(
  client: Client,
  investor: Wallet,
  vaultId: string,
  issuanceId: string,
  units: number,
  expect?: string,
  record?: boolean,
): Promise<SubmitResult> {
  return submit(
    client,
    investor,
    { TransactionType: 'VaultDeposit', VaultID: vaultId, Amount: mptAmount(issuanceId, units) },
    { expect, record },
  )
}

export async function withdraw(
  client: Client,
  investor: Wallet,
  vaultId: string,
  issuanceId: string,
  units: number,
  expect?: string,
  record?: boolean,
): Promise<SubmitResult> {
  return submit(
    client,
    investor,
    { TransactionType: 'VaultWithdraw', VaultID: vaultId, Amount: mptAmount(issuanceId, units) },
    { expect, record },
  )
}

/** Redeems everything an investor's shares are actually worth right now, instead of a
 * face-value amount fixed at deposit time. Needed because share price moves — a default
 * not fully absorbed by the manager's cushion drops it below 1, so re-requesting the
 * original deposit amount overdraws the investor's real entitlement and returns
 * `tecINSUFFICIENT_FUNDS` (found rehearsing s10 after a real default: see docs/FRICTION.md).
 * All-integer math throughout, matching CLAUDE.md's "never do float math on ledger
 * amounts" — a BigInt floor division intentionally leaves a small amount unredeemed
 * rather than risk rounding the request up past what's actually owned. */
export async function withdrawMax(
  client: Client,
  investor: Wallet,
  vaultId: string,
  shareMptId: string,
  issuanceId: string,
): Promise<SubmitResult> {
  const vault = await vaultInfo(client, vaultId)
  const assetsTotal = BigInt(String(vault.AssetsTotal ?? '0'))
  const outstandingShares = BigInt(
    String((vault.shares as { OutstandingAmount?: string } | undefined)?.OutstandingAmount ?? '0'),
  )
  const sharesOwned = BigInt(await mptBalance(client, investor.classicAddress, shareMptId))
  const redeemable = outstandingShares > 0n ? (sharesOwned * assetsTotal) / outstandingShares : 0n

  return submit(client, investor, {
    TransactionType: 'VaultWithdraw',
    VaultID: vaultId,
    Amount: { mpt_issuance_id: issuanceId, value: redeemable.toString() },
  })
}
