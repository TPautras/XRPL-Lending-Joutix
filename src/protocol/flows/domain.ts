import type { Client, Wallet } from 'xrpl'
import { submit } from '../lib/submit.js'
import { createdNode } from '../lib/meta.js'
import { loadState, saveState } from '../lib/state.js'
import { credentialType } from './credentials.js'

/** The gate: a PermissionedDomain naming the one accepted credential. Vault deposits
 * (and, per CLAUDE.md's design invariant, only deposits — not withdrawals) require it. */
export async function createDomain(client: Client, manager: Wallet, authority: Wallet): Promise<string> {
  const state = loadState()
  if (state.domainId) return state.domainId

  const { meta } = await submit(client, manager, {
    TransactionType: 'PermissionedDomainSet',
    AcceptedCredentials: [{ Credential: { Issuer: authority.classicAddress, CredentialType: credentialType() } }],
  })

  const { index } = createdNode(meta, 'PermissionedDomain')
  state.domainId = index
  saveState(state)
  return index
}
