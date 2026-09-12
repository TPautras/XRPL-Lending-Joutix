import type { Client, Wallet } from 'xrpl'
import { submit, type SubmitResult } from '../lib/submit.js'
import { createdNode } from '../lib/meta.js'
import { mptAmount } from '../lib/mpt.js'
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

export async function deposit(
  client: Client,
  investor: Wallet,
  vaultId: string,
  issuanceId: string,
  units: number,
  expect?: string,
): Promise<SubmitResult> {
  return submit(
    client,
    investor,
    { TransactionType: 'VaultDeposit', VaultID: vaultId, Amount: mptAmount(issuanceId, units) },
    { expect },
  )
}

export async function withdraw(
  client: Client,
  investor: Wallet,
  vaultId: string,
  issuanceId: string,
  units: number,
  expect?: string,
): Promise<SubmitResult> {
  return submit(
    client,
    investor,
    { TransactionType: 'VaultWithdraw', VaultID: vaultId, Amount: mptAmount(issuanceId, units) },
    { expect },
  )
}
