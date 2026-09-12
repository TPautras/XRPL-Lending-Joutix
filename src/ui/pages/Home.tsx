import { AccountPanel } from '../components/AccountPanel'
import { WalletConnectNotice } from '../components/WalletConnectNotice'
import { SectionHeading } from '../components/Panel'
import { hrefFor } from '../lib/router'

const ROLES = [
  {
    role: 'Investor',
    does: 'Deposits into the shared reserve and receives a share of it',
    primitive: 'VaultDeposit · vault shares (MPT)',
  },
  {
    role: 'Manager (broker)',
    does: 'Picks which invoices to fund — and posts their own money first-loss before any loan',
    primitive: 'LoanBrokerSet · LoanBrokerCoverDeposit',
  },
  {
    role: 'SME (borrower)',
    does: 'Borrows against an invoice today, repays on schedule',
    primitive: 'LoanSet (dual-signed) · LoanPay',
  },
  {
    role: 'Insurer',
    does: 'Sells default protection on one specific loan, locks the covered amount, keeps the premium if the loan performs',
    primitive: 'EscrowCreate · EscrowFinish / EscrowCancel',
  },
  {
    role: 'Authority',
    does: 'Issues the compliance credential that the reserve requires',
    primitive: 'CredentialCreate · PermissionedDomainSet',
  },
]

const PRIMITIVES = [
  'Single Asset Vault (XLS-65)',
  'Lending Protocol (XLS-66)',
  'MPT',
  'Credentials',
  'Permissioned Domain',
  'TokenEscrow',
]

/**
 * Pitch 0:00–1:00. Deliberately static — no RPC, no state.json — so it renders even if the
 * devnet is down or has reset mid-pitch. It is the safe screen to open on.
 */
export function Home() {
  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">Invoice factoring + credit insurance on the XRP Ledger</p>
        <h1>
          An SME ships, invoices, and waits <span className="hero-accent">90 days</span> to get paid.
        </h1>
        <p className="lede">
          TrustFlow pays the invoice immediately. Investors pool capital in a shared reserve, a
          manager selects which invoices to fund by putting their own money in first-loss, and an
          insurer covers the default risk on a given loan.
        </p>
        <p className="claim">
          Every step — deposit, loan, repayment, default, payout — is native XLS-65 and XLS-66,
          coupled with Credentials, a Permissioned Domain and TokenEscrow. <strong>No custom
          contracts.</strong>
        </p>
        <div className="actions">
          <a className="btn btn-primary" href={hrefFor('/dashboard')}>
            Open the live reserve
          </a>
          <a className="btn" href={hrefFor('/findings')}>
            What we found
          </a>
        </div>
        <ul className="chips">
          {PRIMITIVES.map((primitive) => (
            <li key={primitive} className="chip">
              {primitive}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionHeading sub="Who puts money in, and whose money is at risk first">
          The four roles
        </SectionHeading>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Does</th>
                <th>On-ledger</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((row) => (
                <tr key={row.role}>
                  <th scope="row">{row.role}</th>
                  <td>{row.does}</td>
                  <td>
                    <code>{row.primitive}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Share value rises mechanically as the reserve collects interest — there is no
          distribution transaction, the appreciation is in the share price itself
          (<code>AssetsTotal</code> growth).
        </p>
      </section>

      <section>
        <SectionHeading sub="Said out loud rather than hidden — all three reasons are design, not omission">
          This webapp is read-only
        </SectionHeading>
        <ol className="reasons">
          <li>
            Every flow is signed in <code>src/protocol/</code> with seeds from <code>.env</code>.
            The browser holds no key.
          </li>
          <li>
            <code>LoanSet</code> is dual-signed — a connected wallet holds one of the two keys it
            needs, never both.
          </li>
          <li>
            A visitor’s wallet holds no <code>Credential</code>, so a deposit from it lands{' '}
            <code>tecNO_AUTH</code>. That is the gate working exactly as designed, but on stage it
            would read as a broken app.
          </li>
        </ol>
        <p className="muted small">
          So there is no button here that submits a TrustFlow transaction. The wallet widget below
          shows a connected account and nothing else.
        </p>
      </section>

      <section className="stack">
        <AccountPanel />
        <WalletConnectNotice />
      </section>
    </div>
  )
}
