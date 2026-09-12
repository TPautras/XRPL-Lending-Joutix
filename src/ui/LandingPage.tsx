import { useWallet } from './wallet/WalletContext'
import { WalletHeaderControl } from './components/WalletHeaderControl'
import { ConnectWalletButton } from './components/ConnectWalletButton'

const PHASES = [
  {
    n: '01',
    name: 'Subscription',
    window: '→ SubscriptionDate',
    body: 'Investors deposit the stablecoin into the vault. Each deposit mints shares 1:1 — the tradable certificate for a slice of the loan to come.',
  },
  {
    n: '02',
    name: 'Investment',
    window: 'SubscriptionDate → RedemptionDate',
    body: 'The broker originates a single fixed-term loan sized to the pool. Interest accrues to the vault as repayments land. Deposits and withdrawals are locked.',
  },
  {
    n: '03',
    name: 'Redemption',
    window: 'RedemptionDate →',
    body: 'The loan has fully amortized. Investors withdraw principal plus accrued yield — the spread between what went in and what comes out is the whole thesis.',
  },
]

const REJECTIONS = [
  { tx: 'VaultDeposit', phase: 'Investment' },
  { tx: 'VaultWithdraw', phase: 'Investment' },
  { tx: 'LoanSet', phase: 'Redemption' },
]

export function LandingPage() {
  const { error, clearError } = useWallet()

  return (
    <div className="landing">
      <header className="l-nav">
        <span className="l-nav-brand">Afflucturation</span>
        <WalletHeaderControl />
      </header>

      {error && (
        <div className="l-error-bar">
          <span>{error}</span>
          <button type="button" className="l-error-dismiss" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}

      <section className="l-hero">
        <p className="l-eyebrow">XRPL · Closed-End Credit Protocol</p>
        <h1 className="l-title">Afflucturation</h1>
        <p className="l-subtitle">
          A bond, native to the ledger. One closed-end vault, one fixed-term loan, shares that
          trade like the certificate they are — built entirely on XLS-65/66 transactions, no
          custom contracts.
        </p>

        <div className="l-cta-row">
          <ConnectWalletButton />
          <a className="l-btn l-btn-ghost" href="#how-it-works">
            See how it works
          </a>
        </div>

        <div className="l-meta">
          <span className="l-chip">Devnet · rippled 3.4.0-rc5</span>
          <span className="l-chip">SingleAssetVault + LendingProtocol</span>
        </div>
      </section>

      <section className="l-section" id="how-it-works">
        <div className="l-section-head">
          <p className="l-kicker">How it works</p>
          <h2 className="l-h2">Three phases, cut by two dates</h2>
        </div>

        <div className="l-phases">
          {PHASES.map((phase) => (
            <div className="l-phase" key={phase.n}>
              <span className="l-phase-n">{phase.n}</span>
              <h3 className="l-phase-name">{phase.name}</h3>
              <code className="l-phase-window">{phase.window}</code>
              <p className="l-phase-body">{phase.body}</p>
            </div>
          ))}
        </div>

        <div className="l-ledger">
          <p className="l-ledger-title">Enforced out of phase</p>
          <ul className="l-ledger-list">
            {REJECTIONS.map((r) => (
              <li key={r.tx}>
                <code>{r.tx}</code>
                <span className="l-ledger-sep">rejected during</span>
                <span>{r.phase}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="l-section l-cta">
        <h2 className="l-h2">Every step is a real Devnet transaction</h2>
        <p className="l-cta-body">
          No mocks. Deposit, origination, repayment, and redemption all submit live to Devnet —
          connect a wallet to run the full lifecycle yourself.
        </p>
        <ConnectWalletButton />
      </section>

      <footer className="l-footer">
        <div className="l-footer-top">
          <div className="l-footer-col l-footer-brand">
            <p className="l-footer-title">Afflucturation</p>
            <p className="l-footer-tagline">Closed-end credit protocol on XRPL</p>
          </div>

          <div className="l-footer-col">
            <a className="l-footer-heading" href="#how-it-works">
              How it works
            </a>
            <ul className="l-footer-list">
              <li>Subscription</li>
              <li>Investment</li>
              <li>Redemption</li>
            </ul>
          </div>

          <div className="l-footer-col">
            <span className="l-footer-heading">Get started</span>
            <p className="l-footer-list">{'→'} Connect a wallet up top to run it live</p>
          </div>
        </div>

        <p className="l-footer-bottom">
          XRPL Ledger Apps Hackathon — built on XLS-65 Vaults &amp; XLS-66 Lending
        </p>
      </footer>
    </div>
  )
}
