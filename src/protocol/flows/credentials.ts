import type { Client, Wallet } from 'xrpl'
import { submit } from '../lib/submit.js'

/** Fixed compliance credential type for TrustFlow's gate (CLAUDE.md "The gate"). Every
 * participant except the demo's uncredentialed intruder gets one. */
export function credentialType(): string {
  return Buffer.from('TRUSTFLOW_KYC').toString('hex').toUpperCase()
}

/** XLS-70 §3: `lsfAccepted` (0x00010000) is set only by a successful `CredentialAccept`.
 * A `Credential` object exists on the ledger the moment the issuer creates it, so its
 * mere presence in `account_objects` says nothing about whether it grants access. */
export const LSF_CREDENTIAL_ACCEPTED = 0x00010000

/**
 * Issues the compliance credential to `subject`.
 *
 * By default the subject also accepts it, because an *unaccepted* credential does not
 * make its holder a member of a `PermissionedDomain` — XLS-70 §8.2 rejects a credential
 * that "has not been accepted", and §3 states plainly that "a credential should not be
 * considered valid until it has been accepted". Pass `{ accept: false }` to leave it
 * unaccepted on purpose; `flows/gate.ts` uses that to prove the distinction on-ledger,
 * since it is the single easiest way for an integrator to build a gate that silently
 * refuses everyone.
 */
export async function issueCredential(
  client: Client,
  authority: Wallet,
  subject: Wallet,
  opts: { accept?: boolean } = {},
): Promise<void> {
  // Idempotent on purpose. `s8` revokes and restores a credential, so re-running `s1`
  // during a rehearsal would otherwise hit tecDUPLICATE and abort the demo partway
  // through — a needless way to lose a stage run.
  const existing = await credentialStatus(client, authority, subject)
  if (existing.exists) {
    const wantAccepted = opts.accept !== false
    if (existing.accepted === wantAccepted) {
      console.log(`· Credential for ${subject.classicAddress} already in the requested state`)
      return
    }
    if (wantAccepted) {
      await acceptCredential(client, authority, subject)
      return
    }
    // Wanted unaccepted but it is already accepted: revoke and re-issue from scratch.
    await revokeCredential(client, authority, subject)
  }

  await submit(client, authority, {
    TransactionType: 'CredentialCreate',
    Subject: subject.classicAddress,
    CredentialType: credentialType(),
  })
  if (opts.accept !== false) await acceptCredential(client, authority, subject)
}

/** The subject's half of the handshake — until this lands, the credential is inert. */
export async function acceptCredential(client: Client, authority: Wallet, subject: Wallet): Promise<void> {
  await submit(client, subject, {
    TransactionType: 'CredentialAccept',
    Issuer: authority.classicAddress,
    CredentialType: credentialType(),
  })
}

/**
 * Revokes a credential. XLS-70 §5 lets the issuer delete at any time (the subject may
 * too, and anyone may once an `Expiration` has passed) — "deleting a credential is also
 * how a credential is un-accepted".
 *
 * Revocation stands in for expiry throughout the demo: an expired credential stops
 * counting toward domain membership exactly the way a deleted one does, and revocation
 * is instantaneous instead of forcing the demo to wait out a clock. The invariant being
 * shown is the same one CLAUDE.md calls out — losing the credential must not lock an
 * investor out of funds they already deposited.
 */
export async function revokeCredential(client: Client, authority: Wallet, subject: Wallet): Promise<void> {
  await submit(client, authority, {
    TransactionType: 'CredentialDelete',
    Subject: subject.classicAddress,
    CredentialType: credentialType(),
  })
}

export interface CredentialStatus {
  exists: boolean
  accepted: boolean
}

/** Reads the credential straight off the ledger rather than trusting what we submitted —
 * `exists` without `accepted` is precisely the state that looks fine in a wallet UI and
 * still fails every domain check. */
export async function credentialStatus(
  client: Client,
  authority: Wallet,
  subject: Wallet,
): Promise<CredentialStatus> {
  const { result } = await client.request({
    command: 'account_objects',
    account: subject.classicAddress,
    type: 'credential',
    ledger_index: 'validated',
  } as never)
  const objects = (result as { account_objects: Array<Record<string, unknown>> }).account_objects

  // An unaccepted credential sits in the ISSUER's owner directory, not the subject's
  // (XLS-70 §3: the reserve follows `lsfAccepted`), so a subject-side lookup alone would
  // report "no credential" for a credential that demonstrably exists. Check both sides.
  const mine = objects.find(
    (o) => o.Issuer === authority.classicAddress && o.CredentialType === credentialType(),
  )
  if (mine) {
    return { exists: true, accepted: (Number(mine.Flags ?? 0) & LSF_CREDENTIAL_ACCEPTED) !== 0 }
  }

  const { result: issuerResult } = await client.request({
    command: 'account_objects',
    account: authority.classicAddress,
    type: 'credential',
    ledger_index: 'validated',
  } as never)
  const issued = (issuerResult as { account_objects: Array<Record<string, unknown>> }).account_objects
  const theirs = issued.find(
    (o) => o.Subject === subject.classicAddress && o.CredentialType === credentialType(),
  )
  if (!theirs) return { exists: false, accepted: false }
  return { exists: true, accepted: (Number(theirs.Flags ?? 0) & LSF_CREDENTIAL_ACCEPTED) !== 0 }
}
