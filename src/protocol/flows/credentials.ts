import type { Client, Wallet } from 'xrpl'
import { submit } from '../lib/submit.js'

/** Fixed compliance credential type for TrustFlow's gate (CLAUDE.md "The gate"). Every
 * participant except the demo's uncredentialed intruder gets one. */
export function credentialType(): string {
  return Buffer.from('TRUSTFLOW_KYC').toString('hex').toUpperCase()
}

export async function issueCredential(client: Client, authority: Wallet, subject: Wallet): Promise<void> {
  await submit(client, authority, {
    TransactionType: 'CredentialCreate',
    Subject: subject.classicAddress,
    CredentialType: credentialType(),
  })
  // An unaccepted credential does not count toward domain access (XLS-80) — the
  // subject must explicitly accept it before any PermissionedDomain treats it as valid.
  await submit(client, subject, {
    TransactionType: 'CredentialAccept',
    Issuer: authority.classicAddress,
    CredentialType: credentialType(),
  })
}
