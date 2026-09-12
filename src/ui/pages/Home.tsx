import { href } from '../router'
import { NETWORK } from '../wallet/config'

/**
 * The pitch's first minute, on one screen.
 *
 * Deliberately static: no RPC, no subscription, no `state.json`. This is the screen to
 * open on if the devnet has reset or the venue wifi has given up — it renders identically
 * either way. Everything on it is a fact about the design, not about the current ledger.
 */

const ROLES = [
  {
    role: 'Investor',
    line: 'Deposits into the shared reserve and gets a share back. Share value rises as the reserve collects interest — there is no distribution step, the appreciation is the share price.',
    txs: ['VaultDeposit', 'VaultWithdraw'],
  },
  {
    role: 'Manager',
    line: 'Picks which invoices are worth funding — and posts their own capital first-loss before a single loan is written. If a borrower defaults, that cushion is drained before an investor loses a cent.',
    txs: ['LoanBrokerSet', 'LoanBrokerCoverDeposit'],
    emphasis: true,
  },
  {
    role: 'SME',
    line: 'Borrows against an invoice it has already earned and repays on schedule. Origination is dual-signed: the borrower asks, the manager counter-signs, one transaction.',
    txs: ['LoanSet', 'LoanPay'],
  },
  {
    role: 'Insurer',
    line: 'Sells default protection on one specific loan, locks the covered amount on-ledger, and keeps the premiums if the loan performs.',
    txs: ['EscrowCreate', 'EscrowFinish'],
  },
]

const PRIMITIVES = [
  { xls: 'XLS-65', name: 'Single Asset Vault', use: 'the shared reserve and its shares' },
  { xls: 'XLS-66', name: 'Lending Protocol', use: 'broker, loans, repayment, first-loss, default' },
  { xls: 'XLS-33', name: 'MPT', use: 'the demo stablecoin and the vault shares' },
  { xls: 'XLS-70', name: 'Credentials', use: 'who is allowed in' },
  { xls: 'XLS-80', name: 'Permissioned Domain', use: 'which credentials the vault accepts' },
  { xls: 'XLS-85', name: 'TokenEscrow', use: 'the credit-insurance lock' },
]

const CYCLE = ['Deposit', 'Post cover', 'Originate', 'Repay', 'Share price ↑', 'Withdraw']

function Hero() {
  return (
    <section className="hero">
      <p className="eyebrow">
        <span className="chip">Track 1 · Loaded</span>
        <span className="chip">XLS-65 + XLS-66</span>
        <span className="chip">No custom contracts</span>
      </p>

      <h2 className="hero-title">
        The invoice is signed. The money shows up in ninety days.
        <span className="hero-title-accent">TrustFlow pays it today.</span>
      </h2>

      <p className="hero-lede">
        An SME ships, invoices, and then finances its customer for a quarter at zero interest.
        TrustFlow buys that wait: investors pool capital into a shared reserve, a manager chooses
        which invoices to fund and puts their own money in first-loss before lending yours, and an
        insurer covers the default risk on a named loan.
      </p>

      <p className="actions">
        <a className="btn btn-primary" href={href('/dashboard')}>
          Open the live reserve →
        </a>
        <span className="muted hero-actions-note">
          Read-only. Every transaction is signed off-browser by the protocol scripts.
        </span>
      </p>
    </section>
  )
}

function TheWait() {
  return (
    <section className="panel">
      <h3 className="section-title">The 90-day hole</h3>
      <div className="wait">
        <div className="wait-row">
          <span className="wait-name">Today</span>
          <span className="wait-bar">
            <span className="wait-fill wait-fill-slow" />
          </span>
          <span className="wait-value">60–90 days of earned revenue, frozen</span>
        </div>
        <div className="wait-row">
          <span className="wait-name">TrustFlow</span>
          <span className="wait-bar">
            <span className="wait-fill wait-fill-fast" />
          </span>
          <span className="wait-value">paid at origination, minus a discount</span>
        </div>
      </div>
      <p className="muted section-note">
        The receivable is not a promise — the work is done and the invoice is issued. What the SME
        is missing is a counterparty willing to hold the wait. On TrustFlow that counterparty is a
        reserve anyone can deposit into, and the wait is priced as interest.
      </p>
    </section>
  )
}

function Roles() {
  return (
    <section>
      <h3 className="section-title">Four roles, and who is exposed first</h3>
      <div className="roles">
        {ROLES.map((r) => (
          <article key={r.role} className={`panel role${r.emphasis ? ' role-emphasis' : ''}`}>
            <p className={`status ${r.emphasis ? 'status-on' : 'status-off'}`}>
              <span className="dot" /> {r.role}
            </p>
            <p className="role-line">{r.line}</p>
            <p className="role-txs">
              {r.txs.map((tx) => (
                <code key={tx}>{tx}</code>
              ))}
            </p>
          </article>
        ))}
      </div>
      <p className="muted section-note">
        The order matters and it is enforced by the protocol, not by a promise: XLS-66 refuses to
        originate a loan that would push the broker below its <code>CoverRateMinimum</code>. The
        manager cannot lend the reserve&rsquo;s money without having posted their own first.
      </p>
    </section>
  )
}

function Native() {
  return (
    <section className="panel panel-native">
      <h3 className="section-title">Every step is a native transaction. No custom contracts.</h3>
      <p className="muted section-note">
        There is no hook, no sidechain, no off-ledger matching engine and no smart contract holding
        anyone&rsquo;s funds. Deposit, cover, origination, repayment, default and payout are each a
        transaction type that already exists on the ledger — which is also why every claim on this
        site resolves to a hash you can open in an explorer.
      </p>
      <ul className="primitives">
        {PRIMITIVES.map((p) => (
          <li key={p.xls}>
            <span className="primitive-xls">{p.xls}</span>
            <span className="primitive-name">{p.name}</span>
            <span className="muted">{p.use}</span>
          </li>
        ))}
      </ul>
      <p className="cycle">
        {CYCLE.map((step, i) => (
          <span key={step}>
            {i > 0 && <span className="cycle-arrow">→</span>}
            <span className="cycle-step">{step}</span>
          </span>
        ))}
      </p>
    </section>
  )
}

function Gate() {
  return (
    <section className="panel">
      <h3 className="section-title">The gate — and the door it deliberately leaves open</h3>
      <p className="role-line">
        Every participant needs a <code>Credential</code> accepted by the vault&rsquo;s{' '}
        <code>PermissionedDomain</code> before they can deposit. An account without one is refused
        with <code>tecNO_AUTH</code>; so is an account holding a credential that was issued but
        never accepted, which makes <code>CredentialAccept</code> load-bearing rather than
        ceremonial.
      </p>
      <p className="role-line">
        <strong>Withdrawal is not gated, on purpose.</strong> An investor whose credential expires
        or is revoked is refused on the way in and still paid on the way out. That is an XLS-65 §7
        guarantee, not our leniency — we verified both halves on the live devnet.
      </p>
    </section>
  )
}

function Reporting() {
  return (
    <section className="panel">
      <h3 className="section-title">What we are reporting back</h3>
      <ol className="steps steps-findings">
        <li>
          <strong>A credit derivative cannot be made trustless here.</strong> TokenEscrow releases
          on a time condition or a crypto-condition — never on another ledger object&rsquo;s state.
          No escrow can ask whether a given <code>Loan</code> defaulted, so a named third party has
          to observe it and submit the release. We say who that party is rather than drawing an
          arrow that implies it is automatic.
        </li>
        <li>
          <strong>A private vault gates deposits, not loans.</strong> <code>LoanSet</code> never
          consults the vault&rsquo;s permissioned domain. An account refused a deposit with{' '}
          <code>tecNO_AUTH</code> was handed that same vault&rsquo;s assets as a loan in the next
          transaction. Not an exploit — origination is dual-signed, so the broker still has to
          counter-sign — but with a domain configured, the borrower check is the broker&rsquo;s
          off-ledger discretion alone.
        </li>
        <li>
          <strong>Two behaviours the spec does not lead you to.</strong>{' '}
          <code>PrincipalRequested</code> is denominated in raw MPT base units, not the asset&rsquo;s
          display scale, and <code>tfLoanFullPayment</code> returns <code>tecKILLED</code> on the
          final installment of a loan.
        </li>
      </ol>
      <p className="muted section-note">
        Each one has a repro command and on-ledger hashes in <code>FEEDBACK_REPORT.md</code> and{' '}
        <code>docs/FRICTION.md</code>.
      </p>
    </section>
  )
}

function Scope() {
  return (
    <section className="panel panel-scope">
      <p className="muted">
        <strong>Not used:</strong> the Price Oracle (XLS-47). Valuing the financed receivable against a feed
        is in our architecture as optional and we did not get to it — no screen on this site claims
        an oracle price. <strong>Not built on:</strong> batch transactions, currently disabled on
        the network after a security issue.
      </p>
      <p className="muted">
        Environment: <code>{NETWORK.name}</code> · <code>rippled 3.4.0-rc1</code> · network id{' '}
        <code>4001</code> · <code>xrpl@5.2.0</code>.
      </p>
    </section>
  )
}

export function Home() {
  return (
    <div className="home">
      <Hero />
      <TheWait />
      <Roles />
      <Native />
      <Gate />
      <Reporting />
      <Scope />
    </div>
  )
}
