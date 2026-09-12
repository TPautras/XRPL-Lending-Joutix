import type { SubmittableTransaction } from 'xrpl'
import { LedgerEntry, type Client } from 'xrpl'
import { Chip, NeedsDemo, Panel, SectionHeading } from '../components/Panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AddressLink, ResultPill, TxLink } from '../components/TxLink'
import { BadgeCheck } from 'lucide-react'
import { useAppState } from '../lib/appState'
import { useLedgerQuery } from '../lib/ledger'
import { eur, isoToDateTime } from '../lib/format'
import { useWalletSubmit } from '../lib/walletActions'
import { GATE_SUBJECT, GATE_VAULT, RECORDED_GATE, RECORDED_RUN_DATE, type GateRow } from '../lib/evidence'
import { hrefFor } from '../lib/router'
import { useWallet } from '../wallet/WalletContext'

/** Must match `flows/credentials.ts credentialType()` — hex of the ASCII type, uppercase. */
const DEFAULT_CREDENTIAL_TYPE = Array.from('TRUSTFLOW_KYC')
  .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0'))
  .join('')
  .toUpperCase()

/** XLS-70 §3: set only by a successful `CredentialAccept`. xrpl.js types `Credential.Flags`
 * as `number | CredentialFlags`, so both shapes are handled rather than assumed. */
const LSF_CREDENTIAL_ACCEPTED = 0x00010000

function isAccepted(credential: LedgerEntry.Credential): boolean {
  const flags = credential.Flags
  return typeof flags === 'number' ? (flags & LSF_CREDENTIAL_ACCEPTED) !== 0 : Boolean(flags.lsfAccepted)
}

const ROLE_LABEL: Record<string, string> = {
  authority: 'Authority (issuer of the credential)',
  issuer: 'TFEUR issuer',
  manager: 'Manager / loan broker',
  sme: 'SME borrower',
  smeUncredentialed: 'Uncredentialed SME (the intruder)',
  investorA: 'Investor A',
  investorB: 'Investor B',
  insurer: 'Insurer',
}

type CredentialState = 'missing' | 'issued, not accepted' | 'accepted'

interface RoleRow {
  role: string
  address: string
  credential: CredentialState
  balance: string | null
}

async function credentialObjects(client: Client, account: string): Promise<LedgerEntry.Credential[]> {
  const { result } = await client.request({
    command: 'account_objects',
    account,
    type: 'credential',
    ledger_index: 'validated',
  })
  return result.account_objects.filter(
    (object): object is LedgerEntry.Credential => object.LedgerEntryType === 'Credential',
  )
}

async function mptBalance(client: Client, account: string, issuanceId: string): Promise<string | null> {
  try {
    const { result } = await client.request({ command: 'account_objects', account, type: 'mptoken' })
    // One cast, and the only one in this app: xrpl.js 5.2.0 exports the `MPToken` model and
    // accepts `type: 'mptoken'` as a filter, but `MPToken` is missing from the `LedgerEntry`
    // union that types `account_objects`, so the response cannot describe what it returns.
    // Logged in docs/FRICTION.md.
    const objects = result.account_objects as unknown as LedgerEntry.MPToken[]
    const held = objects.find(
      (object) => object.LedgerEntryType === 'MPToken' && object.MPTokenIssuanceID === issuanceId,
    )
    return held?.MPTAmount ?? '0'
  } catch {
    // Fires when the account itself is not on the ledger yet (`actNotFound`) or the RPC
    // hiccups — an account that simply holds no MPT returns an empty list, not an error.
    // Either way, report the absence rather than a confident zero.
    return null
  }
}

/**
 * Reads each participant's credential state off the ledger. Both owner directories are
 * checked on purpose: an *unaccepted* credential sits in the issuer's directory, not the
 * subject's, so a subject-side lookup alone reports "no credential" for a credential that
 * demonstrably exists — the single easiest way to build a gate that refuses everyone.
 */
async function readRoles(
  client: Client,
  accounts: Record<string, string>,
  authority: string,
  credentialType: string,
  issuanceId: string | undefined,
): Promise<RoleRow[]> {
  const issued = await credentialObjects(client, authority).catch(() => [])

  return Promise.all(
    Object.entries(accounts).map(async ([role, address]) => {
      let credential: CredentialState = 'missing'
      const mine = await credentialObjects(client, address).catch(() => [])
      const own = mine.find((o) => o.Issuer === authority && o.CredentialType === credentialType)
      const held = own ?? issued.find((o) => o.Subject === address && o.CredentialType === credentialType)
      if (held) credential = isAccepted(held) ? 'accepted' : 'issued, not accepted'
      const balance = issuanceId ? await mptBalance(client, address, issuanceId) : null
      return { role, address, credential, balance }
    }),
  )
}

/** Three states, three badge variants — and the badge always carries the words too, so the
 * colour is reinforcement rather than the only channel. */
const CREDENTIAL_TONE = {
  accepted: 'ok',
  'issued, not accepted': 'warn',
  missing: 'err',
} as const satisfies Record<CredentialState, 'ok' | 'warn' | 'err'>

function RolesPanel() {
  const { state } = useAppState()
  const accounts = state?.accounts
  const authority = accounts?.authority
  const credentialType = state?.credentialType ?? DEFAULT_CREDENTIAL_TYPE
  const issuanceId = state?.mptIssuanceId

  const { data, error } = useLedgerQuery<RoleRow[]>(
    !accounts || !authority
      ? null
      : (client) => readRoles(client, accounts, authority, credentialType, issuanceId),
    [accounts && Object.keys(accounts).join(','), authority, credentialType, issuanceId],
    // Eight accounts means ~17 requests a pass; this table does not need to move every 4s.
    { refreshEveryTicks: 4 },
  )

  if (!accounts || !authority) {
    return (
      <Panel title="Participants" tone="off">
        <NeedsDemo
          what="The role addresses are written to state.json by the demo runner"
          command="npm run demo setup"
        />
      </Panel>
    )
  }

  return (
    <Panel
      title="Participants"
      aside={
        <Chip>
          credential type <code className="text-foreground">TRUSTFLOW_KYC</code>
        </Chip>
      }
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Credential</TableHead>
              <TableHead className="text-right">TFEUR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Eight skeleton rows rather than an empty table: a panel that renders blank
                while ~17 requests are in flight reads as broken on a projector. */}
            {!data &&
              Object.keys(ROLE_LABEL).map((role) => (
                <TableRow key={role}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {(data ?? []).map((row) => (
              <TableRow key={row.role}>
                <TableCell className="font-semibold">{ROLE_LABEL[row.role] ?? row.role}</TableCell>
                <TableCell>
                  <AddressLink address={row.address} />
                </TableCell>
                <TableCell>
                  <Badge variant={CREDENTIAL_TONE[row.credential]}>{row.credential}</Badge>
                </TableCell>
                <TableCell className="text-right">{row.balance === null ? '—' : eur(row.balance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {error && <p className="text-muted-foreground mt-2 text-[13px]">Last read failed: {error}</p>}
      <p className="text-muted-foreground mt-3 text-[13px]">
        Read live with <code className="text-foreground">account_objects type=credential</code> against both the
        subject’s and the issuer’s owner directory — an unaccepted credential lives in the issuer’s.
      </p>
    </Panel>
  )
}

function MatrixPanel() {
  const { state } = useAppState()
  const live = state?.gate
  const rows: GateRow[] = live?.observations ?? RECORDED_GATE

  return (
    <Panel
      title="What the ledger answered"
      aside={<Chip>{live ? `live · ${isoToDateTime(live.ts)}` : `recorded run · ${RECORDED_RUN_DATE}`}</Chip>}
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Credential state</TableHead>
              <TableHead>Transaction</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Hash</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.state}-${row.action}-${index}`}>
                <TableCell className="font-semibold">{row.state}</TableCell>
                <TableCell className="whitespace-normal">
                  <code>{row.action}</code>
                  {row.note && <span className="text-muted-foreground text-xs"> — {row.note}</span>}
                </TableCell>
                <TableCell>
                  <ResultPill result={row.result} type={row.action} />
                </TableCell>
                <TableCell>
                  <TxLink hash={row.hash} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-muted-foreground mt-3 text-[13px]">
        One account (<AddressLink address={GATE_SUBJECT} />) walked through every credential state
        against the private vault <code>{GATE_VAULT.slice(0, 12)}…{GATE_VAULT.slice(-6)}</code>.
        Reproduce with <code className="text-foreground">npm run demo gate</code> — it is idempotent.
      </p>
    </Panel>
  )
}

/**
 * `CredentialAccept` needs only the subject's own signature — the one gate-side action a
 * connected wallet can take directly, unlike `CredentialCreate`/`CredentialDelete`, which
 * are the authority's alone and stay in `flows/credentials.ts`.
 */
function CredentialActionPanel() {
  const { state } = useAppState()
  const { account, isConnected } = useWallet()
  const { pending, error, clearError, send } = useWalletSubmit()

  const accounts = state?.accounts
  const authority = accounts?.authority
  const credentialType = state?.credentialType ?? DEFAULT_CREDENTIAL_TYPE
  const address = account?.address ?? null

  const { data: status } = useLedgerQuery<CredentialState>(
    !address || !authority
      ? null
      : async (client) => {
          const mine = await credentialObjects(client, address).catch(() => [])
          const own = mine.find((o) => o.Issuer === authority && o.CredentialType === credentialType)
          if (own) return isAccepted(own) ? 'accepted' : 'issued, not accepted'
          const issued = await credentialObjects(client, authority).catch(() => [])
          const theirs = issued.find((o) => o.Subject === address && o.CredentialType === credentialType)
          if (!theirs) return 'missing'
          return isAccepted(theirs) ? 'accepted' : 'issued, not accepted'
        },
    [address, authority, credentialType],
  )

  if (!isConnected) {
    return (
      <Panel title="Accept your own credential" tone="off">
        <p className="text-muted-foreground text-sm">
          Connect a wallet to check whether the authority has issued you a credential, and accept it — the one gate-side
          action that needs only your own signature.
        </p>
      </Panel>
    )
  }

  if (!authority) {
    return (
      <Panel title="Accept your own credential" tone="off">
        <NeedsDemo what="No authority address on record yet" command="npm run demo setup" />
      </Panel>
    )
  }

  const accept = () => {
    if (!address) return
    void send(
      {
        TransactionType: 'CredentialAccept',
        Account: address,
        Issuer: authority,
        CredentialType: credentialType,
      } as SubmittableTransaction,
      'accept credential',
    )
  }

  return (
    <Panel
      title="Accept your own credential"
      tone={status === 'accepted' ? 'on' : status === 'issued, not accepted' ? 'warn' : 'off'}
      aside={<AddressLink address={address ?? ''} />}
    >
      <p className="text-sm">
        Credential state:{' '}
        {status ? (
          <Badge variant={CREDENTIAL_TONE[status]}>{status}</Badge>
        ) : (
          <span className="text-muted-foreground">checking…</span>
        )}
      </p>
      {status === 'issued, not accepted' && (
        <div className="mt-3.5">
          <Button type="button" disabled={pending !== null} onClick={accept}>
            <BadgeCheck /> {pending ? 'Waiting for your wallet…' : 'Accept credential'}
          </Button>
        </div>
      )}
      {status === 'missing' && (
        <p className="text-muted-foreground mt-2 text-[13px]">
          No credential has been issued to this account yet — that is the authority's action (
          <code className="text-foreground">CredentialCreate</code>), not something this wallet can do for itself.
        </p>
      )}
      {error && (
        <Alert className="border-err/40 mt-3.5" role="alert" aria-live="polite">
          <AlertDescription>
            <p className="wrap-anywhere">{error}</p>
            <Button type="button" variant="ghost" size="sm" onClick={clearError}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </Panel>
  )
}

/**
 * Pitch 3:30–4:00 — the "Loaded" flavour on screen. Two things have to land here: the
 * four-state credential walk, and the fact that withdrawal is deliberately never gated.
 */
export function GatePage() {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeading sub="Every participant needs a Credential accepted by a PermissionedDomain before they can deposit, borrow or hold shares">
        The gate
      </SectionHeading>

      <RolesPanel />
      <CredentialActionPanel />
      <MatrixPanel />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="An unaccepted credential grants nothing" tone="warn">
          <p>
            The <code>Credential</code> object exists on the ledger the moment the issuer creates
            it, and its holder is still refused — exactly as if it did not exist.{' '}
            <code>CredentialAccept</code> is load-bearing, not bookkeeping.
          </p>
          <p className="text-muted-foreground mt-2.5 text-[13px]">
            Skipping it builds a gate that silently refuses everyone. XLS-70 §3: “a credential
            should not be considered valid until it has been accepted.”
          </p>
        </Panel>

        <Panel title="Withdrawal is deliberately ungated">
          <p>
            Revocation closes the door without trapping anyone: the same account is refused on the
            way <strong>in</strong> (<code>tecNO_AUTH</code>) and served on the way{' '}
            <strong>out</strong> (<code>tesSUCCESS</code>).
          </p>
          <p className="text-muted-foreground mt-2.5 text-[13px]">
            This is a ledger guarantee — <code>VaultWithdraw</code> does not consult the
            permissioned domain (XLS-65 §7) — not our leniency. An investor whose credential
            expires must never be locked out of their own funds.
          </p>
        </Panel>
      </div>

      <Panel title="And the part the gate does not cover" tone="warn">
        <p>
          <code>LoanSet</code> never consults the vault’s <code>PermissionedDomain</code>. XLS-66
          §3.8.5.2 lists 24 failure conditions and none of them checks{' '}
          <code>MPTokenIssuance(Vault.ShareMPTID).DomainID</code>; its two <code>tecNO_AUTH</code>{' '}
          cases are asset-holding authorization, a different question. An account refused{' '}
          <code>VaultDeposit</code> with <code>tecNO_AUTH</code> was handed that same vault’s
          assets as a loan in the very next transaction, on two independent runs.
        </p>
        <p>
          <strong>This is not an exploit and we are not claiming one.</strong> <code>LoanSet</code>{' '}
          is dual-signed, so the broker must still counter-sign and nobody can drain the reserve
          unilaterally. The claim is precisely this: with a <code>PermissionedDomain</code>{' '}
          configured, an uncredentialed borrower is stopped by the broker’s off-ledger discretion
          alone, not by the protocol.
        </p>
        <p className="text-muted-foreground mt-2.5 text-[13px]">
          Full write-up, repro and proposed fix on <a href={hrefFor('/findings')}>Findings</a> and in{' '}
          <code>FEEDBACK_REPORT.md §2</code>.
        </p>
      </Panel>
    </div>
  )
}
