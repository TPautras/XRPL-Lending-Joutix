import { useEffect, useState } from 'react'
import { Client } from 'xrpl'
import { NETWORK } from '../wallet/config'
import { clock } from '../lib/format'

/** XLS-70 §3: `lsfAccepted` is set only by a successful `CredentialAccept`. A Credential
 * object exists from the moment the issuer creates it, so its presence proves nothing. */
const LSF_CREDENTIAL_ACCEPTED = 0x00010000

/** `accepted` grants domain membership; `pending` and `missing` both grant nothing —
 * which is the single most useful thing this page has to say. */
export type CredentialState = 'accepted' | 'pending' | 'missing'

export interface GateObservation {
  state: string
  action: string
  result: string
  hash: string
  note?: string
}

export interface GateEvidence {
  ranAt: string
  intruder: string
  vaultId: string
  observations: GateObservation[]
}

export interface RoleRow {
  role: string
  address: string
  /** TFEUR base units, or null when the account holds no `MPToken` for the issuance. */
  balance: number | null
  credential: CredentialState
  /** Where the Credential object actually sits — the subject's directory or the issuer's. */
  heldBy: 'subject' | 'issuer' | null
}

export interface DomainView {
  domainId: string
  owner: string
  /** Each entry is {Issuer, CredentialType} — the credentials this domain will accept. */
  accepted: Array<{ issuer: string; credentialType: string }>
}

export interface GateView {
  connected: boolean
  ready: boolean
  lastUpdate: string | null
  hasAccounts: boolean
  vaultId: string | null
  vaultPrivate: boolean
  shareMptId: string | null
  credentialType: string | null
  domain: DomainView | null
  roles: RoleRow[]
  evidence: GateEvidence | null
}

interface HackathonState {
  mptIssuanceId?: string
  credentialType?: string
  domainId?: string
  vault?: { vaultId: string; shareMptId: string; private: boolean }
  accounts?: Record<string, string>
  gate?: GateEvidence
}

/** Display order, and the order the demo introduces them in. */
const ROLE_ORDER = [
  'authority',
  'issuer',
  'manager',
  'sme',
  'investorA',
  'investorB',
  'insurer',
  'smeUncredentialed',
]

const EMPTY: GateView = {
  connected: false,
  ready: false,
  lastUpdate: null,
  hasAccounts: false,
  vaultId: null,
  vaultPrivate: false,
  shareMptId: null,
  credentialType: null,
  domain: null,
  roles: [],
  evidence: null,
}

/** Hex credential type -> "TRUSTFLOW_KYC". Left as hex if it isn't printable ASCII. */
export function decodeHex(hex: string | null | undefined): string {
  if (!hex) return '—'
  const bytes = hex.match(/../g) ?? []
  const text = bytes.map((b) => String.fromCharCode(parseInt(b, 16))).join('')
  return /^[\x20-\x7e]+$/.test(text) ? text : hex
}

/**
 * Live credential state for all eight role accounts, read straight off the ledger, plus
 * the Phase 2 access matrix that `npm run demo gate` recorded.
 *
 * Read-only: `account_objects` and `ledger_entry`, nothing else. Polls rather than
 * subscribing to ledger closes — one refresh is nine requests, and credential state
 * changes at human speed (one `s1` or `s8` step), not once per four-second close.
 */
export function useGate(): GateView {
  const [view, setView] = useState<GateView>(EMPTY)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const client = new Client(NETWORK.wss)

    /** One call per account: credentials and MPToken balances live in the same directory. */
    async function objectsOf(account: string): Promise<Array<Record<string, unknown>>> {
      try {
        const { result } = await client.request({
          command: 'account_objects',
          account,
          ledger_index: 'validated',
          limit: 400,
        } as never)
        return (result as { account_objects: Array<Record<string, unknown>> }).account_objects
      } catch {
        return []
      }
    }

    async function readDomain(domainId: string): Promise<DomainView | null> {
      try {
        const { result } = await client.request({
          command: 'ledger_entry',
          index: domainId,
          ledger_index: 'validated',
        } as never)
        const node = (result as { node: Record<string, unknown> }).node
        const list = (node.AcceptedCredentials ?? []) as Array<{ Credential?: Record<string, unknown> }>
        return {
          domainId,
          owner: String(node.Owner ?? ''),
          accepted: list.map((entry) => ({
            issuer: String(entry.Credential?.Issuer ?? ''),
            credentialType: String(entry.Credential?.CredentialType ?? ''),
          })),
        }
      } catch {
        return null
      }
    }

    async function refresh(s: HackathonState) {
      const accounts = s.accounts
      if (!accounts || !client.isConnected()) return

      const authority = accounts.authority
      const credType = s.credentialType ?? null

      // The issuer's own directory holds every credential it created; an unaccepted one
      // lives ONLY there, never in the subject's (XLS-70 §3 — the reserve follows
      // lsfAccepted). A subject-side lookup alone reports "no credential" for a
      // credential that demonstrably exists, so both directories are needed.
      const authorityObjects = authority ? await objectsOf(authority) : []
      const issued = authorityObjects.filter(
        (o) => o.LedgerEntryType === 'Credential' && (!credType || o.CredentialType === credType),
      )

      const names = ROLE_ORDER.filter((r) => accounts[r]).concat(
        Object.keys(accounts).filter((r) => !ROLE_ORDER.includes(r)),
      )

      const roles = await Promise.all(
        names.map(async (role): Promise<RoleRow> => {
          const address = accounts[role]
          const objects = await objectsOf(address)

          // `Subject === address` is load-bearing, not redundant: the authority's own
          // directory holds every credential it ISSUED, so matching on Issuer alone
          // reports the authority as credentialed by itself.
          const own = objects.find(
            (o) =>
              o.LedgerEntryType === 'Credential' &&
              o.Subject === address &&
              o.Issuer === authority &&
              (!credType || o.CredentialType === credType),
          )
          const fromIssuer = issued.find((o) => o.Subject === address)
          const found = own ?? fromIssuer
          const accepted = found ? (Number(found.Flags ?? 0) & LSF_CREDENTIAL_ACCEPTED) !== 0 : false

          const mptoken = objects.find(
            (o) => o.LedgerEntryType === 'MPToken' && o.MPTokenIssuanceID === s.mptIssuanceId,
          )

          return {
            role,
            address,
            balance: mptoken ? Number(mptoken.MPTAmount ?? 0) : null,
            credential: !found ? 'missing' : accepted ? 'accepted' : 'pending',
            heldBy: !found ? null : own ? 'subject' : 'issuer',
          }
        }),
      )

      const domain = s.domainId ? await readDomain(s.domainId) : null
      if (cancelled) return

      setView((prev) => ({
        ...prev,
        ready: true,
        lastUpdate: clock(new Date()),
        hasAccounts: true,
        vaultId: s.vault?.vaultId ?? null,
        vaultPrivate: Boolean(s.vault?.private),
        shareMptId: s.vault?.shareMptId ?? null,
        credentialType: credType,
        domain,
        roles,
        evidence: s.gate ?? null,
      }))
    }

    async function tick() {
      try {
        const res = await fetch('/state.json', { cache: 'no-store' })
        if (res.ok) {
          const s = (await res.json()) as HackathonState
          if (!cancelled) {
            setView((prev) => ({
              ...prev,
              hasAccounts: Boolean(s.accounts),
              evidence: s.gate ?? null,
              vaultPrivate: Boolean(s.vault?.private),
            }))
          }
          await refresh(s)
        }
      } catch {
        // state.json doesn't exist until `npm run demo setup` has run once
      }
      if (!cancelled) timer = setTimeout(tick, 6000)
    }

    async function start() {
      try {
        await client.connect()
        if (!cancelled) setView((prev) => ({ ...prev, connected: true }))
      } catch {
        // tick() still renders whatever state.json holds; the live column stays empty
      }
      void tick()
    }

    void start()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      void client.disconnect()
    }
  }, [])

  return view
}
