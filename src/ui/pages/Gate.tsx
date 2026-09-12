import { decodeHex, useGate, type CredentialState, type GateObservation, type RoleRow } from '../gate/useGate'
import { NETWORK } from '../wallet/config'
import { amount, shortId } from '../lib/format'

/**
 * The "Loaded" flavour on screen: who holds which credential right now, and the
 * four-state proof that the vault's PermissionedDomain actually decides deposits.
 *
 * Everything here is read: `account_objects` for the live column, `ledger_entry` for the
 * domain, and the matrix that `npm run demo gate` recorded into state.json. No claim on
 * this page is made in our own words where the ledger has words of its own.
 */

const ROLE_LABEL: Record<string, string> = {
  authority: 'Authority',
  issuer: 'Issuer',
  manager: 'Manager',
  sme: 'SME',
  investorA: 'Investor A',
  investorB: 'Investor B',
  insurer: 'Insurer',
  smeUncredentialed: 'SME (uncredentialed)',
}

/** Why a row without a credential is not a bug. */
const ROLE_NOTE: Record<string, string> = {
  authority: 'issues the credentials; holds none itself',
  issuer: 'issues TFEUR; not a reserve participant',
  smeUncredentialed: 'deliberately uncredentialed — the intruder in s8',
}

const CREDENTIAL_LABEL: Record<CredentialState, string> = {
  accepted: 'accepted',
  pending: 'issued, not accepted',
  missing: 'none',
}

function txUrl(hash: string): string {
  return `${NETWORK.explorer}/transactions/${hash}`
}

function accountUrl(address: string): string {
  return `${NETWORK.explorer}/accounts/${address}`
}

/**
 * On the deposit rows a refusal is the gate working, so `tesSUCCESS` is the good news.
 * On the borrow row it is the finding — rendering that one green would read from the
 * back of the room as "all fine", which is the opposite of the point.
 */
function ResultCode({ code, finding }: { code: string; finding?: boolean }) {
  const tone =
    code === 'not attempted' ? 'muted' : finding ? 'warn' : code === 'tesSUCCESS' ? 'ok' : 'err'
  return <code className={`code-${tone}`}>{code}</code>
}

function CredentialChip({ row }: { row: RoleRow }) {
  const tone = row.credential === 'accepted' ? 'ok' : row.credential === 'pending' ? 'warn' : 'off'
  return (
    <span className={`cred-chip cred-${tone}`}>
      {CREDENTIAL_LABEL[row.credential]}
      {row.credential === 'pending' && <span className="cred-where">in the issuer&rsquo;s directory</span>}
    </span>
  )
}

function DomainPanel({
  domainId,
  owner,
  accepted,
  credentialType,
  vaultId,
  shareMptId,
  vaultPrivate,
}: {
  domainId: string
  owner: string
  accepted: Array<{ issuer: string; credentialType: string }>
  credentialType: string | null
  vaultId: string | null
  shareMptId: string | null
  vaultPrivate: boolean
}) {
  return (
    <div className="panel">
      <p className="status status-on">
        <span className="dot" /> The domain
        {vaultPrivate && <span className="chip chip-inline">vault is private</span>}
      </p>
      <dl className="fields fields-wide">
        <dt>Domain</dt>
        <dd>
          <code>{shortId(domainId)}</code>
        </dd>
        <dt>Owner</dt>
        <dd>
          <a href={accountUrl(owner)} target="_blank" rel="noreferrer">
            <code>{shortId(owner)}</code>
          </a>
          <span className="muted">the manager</span>
        </dd>
        <dt>Accepts</dt>
        <dd className="accepts">
          {accepted.length === 0 ? (
            <span className="muted">nothing — the domain lists no credentials</span>
          ) : (
            accepted.map((c) => (
              <span key={`${c.issuer}-${c.credentialType}`}>
                <code>{decodeHex(c.credentialType)}</code>
                <span className="muted"> issued by </span>
                <code>{shortId(c.issuer)}</code>
              </span>
            ))
          )}
        </dd>
        <dt>Share MPT</dt>
        <dd>
          <code>{shortId(shareMptId ?? undefined)}</code>
          <span className="muted">carries the DomainID</span>
        </dd>
        <dt>Vault</dt>
        <dd>
          <code>{shortId(vaultId ?? undefined)}</code>
        </dd>
      </dl>
      <p className="muted panel-note">
        A deposit is checked against this list, not against a name on a whitelist: XLS-65 §3.5.2.2
        #6 refuses <code>VaultDeposit</code> into a private vault from an account that is not a
        member of the share issuance&rsquo;s domain. Membership means holding an{' '}
        <strong>accepted</strong> <code>{decodeHex(credentialType)}</code> credential from that
        exact issuer.
      </p>
    </div>
  )
}

function Participants({ roles, ready }: { roles: RoleRow[]; ready: boolean }) {
  return (
    <div className="panel">
      <p className={`status ${ready ? 'status-on' : 'status-off'}`}>
        <span className="dot" /> Participants — live
      </p>

      {roles.length === 0 ? (
        <p className="muted">
          No addresses in <code>state.json</code> yet — run <code>npm run demo accounts</code>.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Account</th>
                <th className="num">TFEUR</th>
                <th>Credential</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((row) => (
                <tr key={row.role}>
                  <td>
                    {ROLE_LABEL[row.role] ?? row.role}
                    {ROLE_NOTE[row.role] && <span className="row-note">{ROLE_NOTE[row.role]}</span>}
                  </td>
                  <td>
                    <a href={accountUrl(row.address)} target="_blank" rel="noreferrer">
                      <code>{shortId(row.address)}</code>
                    </a>
                  </td>
                  <td className="num">
                    {row.balance === null ? (
                      <span className="muted" title="no MPToken for this issuance">
                        —
                      </span>
                    ) : (
                      amount(row.balance)
                    )}
                  </td>
                  <td>
                    <CredentialChip row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted panel-note">
        Read from both owner directories on purpose. An <em>unaccepted</em> credential lives only in
        the issuer&rsquo;s directory, never the subject&rsquo;s, so checking the subject alone
        reports &ldquo;no credential&rdquo; for one that demonstrably exists — and the account is
        refused either way.
      </p>
    </div>
  )
}

/** The rows where the ledger did something the spec does not describe. */
function isBorrowRow(o: GateObservation): boolean {
  return o.action.startsWith('LoanSet')
}

function Matrix({ evidence }: { evidence: ReturnType<typeof useGate>['evidence'] }) {
  if (!evidence) {
    return (
      <div className="panel panel-notice">
        <strong>The access matrix has not been captured into this state file</strong>
        <p>
          Run <code>npm run demo gate</code>. It walks one account through every credential state
          against the live vault and records whatever the ledger answers — no expected codes are
          asserted — then writes the rows here with their transaction hashes.
        </p>
      </div>
    )
  }

  const deposits = evidence.observations.filter((o) => !isBorrowRow(o))
  const borrow = evidence.observations.filter(isBorrowRow)

  return (
    <div className="panel">
      <p className="status status-on">
        <span className="dot" /> The four states, proved on-ledger
      </p>
      <p className="muted matrix-sub">
        One account — <code>{shortId(evidence.intruder)}</code> — walked through every credential
        state against the private vault <code>{shortId(evidence.vaultId)}</code>.{' '}
        {new Date(evidence.ranAt).toLocaleString()}
      </p>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Credential state</th>
              <th>Action</th>
              <th>Result</th>
              <th>Transaction</th>
            </tr>
          </thead>
          <tbody>
            {deposits.map((o, i) => (
              <tr key={`${o.state}-${o.action}-${i}`} className={o.action === 'VaultWithdraw' ? 'row-mark' : ''}>
                <td>{o.state}</td>
                <td>
                  <code>{o.action}</code>
                </td>
                <td>
                  <ResultCode code={o.result} />
                </td>
                <td>
                  {o.hash ? (
                    <a href={txUrl(o.hash)} target="_blank" rel="noreferrer">
                      <code>{shortId(o.hash)}</code>
                    </a>
                  ) : (
                    <span className="muted">—</span>
                  )}
                  {o.note && <span className="row-note">{o.note}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted panel-note">
        <strong>Withdrawal is not gated, and that is the ledger&rsquo;s choice, not ours.</strong>{' '}
        The revoked row above is refused on the way in and served on the way out, from the same
        account in the same credential state. XLS-65 §7 states that <code>VaultWithdraw</code>{' '}
        deliberately does not respect permissioned-domain rules, precisely so that revoking a
        credential can never strand a depositor&rsquo;s funds. We did not add leniency; we declined
        to add a restriction the protocol already refuses to make.
      </p>

      {borrow.length > 0 && (
        <>
          <hr className="rule" />
          <p className="status status-warn">
            <span className="dot" /> The same account, the next transaction
          </p>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Credential state</th>
                  <th>Action</th>
                  <th>Result</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {borrow.map((o, i) => (
                  <tr key={i}>
                    <td>{o.state}</td>
                    <td>
                      <code>{o.action}</code>
                    </td>
                    <td>
                      <ResultCode code={o.result} finding={o.result === 'tesSUCCESS'} />
                    </td>
                    <td>
                      {o.hash ? (
                        <a href={txUrl(o.hash)} target="_blank" rel="noreferrer">
                          <code>{shortId(o.hash)}</code>
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                      {o.note && <span className="row-note">{o.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Finding() {
  return (
    <div className="panel panel-finding">
      <p className="status status-warn">
        <span className="dot" /> A private vault gates deposits, not loans
      </p>
      <p className="role-line">
        <code>LoanSet</code> never consults the vault&rsquo;s <code>PermissionedDomain</code>.
        XLS-66 §3.8.5.2 lists 24 failure conditions and none of them looks at the domain on{' '}
        <code>Vault.ShareMPTID</code>; its two <code>tecNO_AUTH</code> cases (#22, #23) are about
        being authorized to <em>hold the asset</em> — an <code>MPToken</code> — which is a different
        question from domain membership.
      </p>
      <p className="role-line">
        So an account refused <code>VaultDeposit</code> with <code>tecNO_AUTH</code> was handed that
        same vault&rsquo;s assets as a loan in the very next transaction, reproduced on two
        independent runs.
      </p>
      <p className="role-line">
        <strong>This is not an exploit and we do not present it as one.</strong>{' '}
        <code>LoanSet</code> is dual-signed: the broker must still counter-sign, so nobody can drain
        a reserve unilaterally. The precise claim is narrower and, for a compliance officer, worse:
        with a domain configured, an uncredentialed borrower is stopped by the broker&rsquo;s
        off-ledger discretion alone, not by the protocol.
      </p>
      <p className="muted panel-note">
        The fix is a two-line documentation change if the behaviour is intended — say plainly that a
        private vault restricts depositors and not borrowers, because the natural reading of
        &ldquo;private vault&rdquo; is that both sides are permissioned. If it is not intended,{' '}
        <code>LoanSet</code> should check the domain for the borrower. Full write-up in{' '}
        <code>FEEDBACK_REPORT.md</code> §2.
      </p>
    </div>
  )
}

export function Gate() {
  const view = useGate()

  return (
    <section className="dash">
      <div className="dash-head">
        <h2>The gate — permissioned deposits</h2>
        <div className="dash-head-right">
          {view.lastUpdate && <span className="chip">read {view.lastUpdate}</span>}
          <span className={`chip ${view.connected ? 'chip-ok' : 'chip-warn'}`}>
            {view.connected ? NETWORK.name : 'connecting…'}
          </span>
        </div>
      </div>

      <p className="page-lede">
        Every participant needs a <code>Credential</code> accepted by a{' '}
        <code>PermissionedDomain</code> before they can put money into the reserve. Below: who holds
        what right now, then the four states one account was walked through to prove the domain is
        what actually decides — and the one door left open on purpose.
      </p>

      {view.domain ? (
        <DomainPanel
          domainId={view.domain.domainId}
          owner={view.domain.owner}
          accepted={view.domain.accepted}
          credentialType={view.credentialType}
          vaultId={view.vaultId}
          shareMptId={view.shareMptId}
          vaultPrivate={view.vaultPrivate}
        />
      ) : (
        <div className="panel">
          <p className="status status-off">
            <span className="dot" /> The domain
          </p>
          <p className="muted">
            No <code>PermissionedDomain</code> in state yet — run <code>npm run demo setup</code>.
          </p>
        </div>
      )}

      <Participants roles={view.roles} ready={view.ready} />

      <Matrix evidence={view.evidence} />

      <Finding />
    </section>
  )
}
