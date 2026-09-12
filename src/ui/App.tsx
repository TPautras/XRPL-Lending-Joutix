import type { ReactElement } from 'react'
import { Nav } from './components/Nav'
import { WalletConnector } from './components/WalletConnector'
import { Dashboard } from './dashboard/Dashboard'
import { ExplorerPage } from './pages/ExplorerPage'
import { FindingsPage } from './pages/FindingsPage'
import { GatePage } from './pages/GatePage'
import { Home } from './pages/Home'
import { InsurancePage } from './pages/InsurancePage'
import { MarketPage } from './pages/MarketPage'
import { useRoute, type Route } from './lib/router'
import { useWallet } from './wallet/WalletContext'
import { NETWORK } from './lib/network'

const PAGES: Record<Route, () => ReactElement> = {
  '/': Home,
  '/dashboard': Dashboard,
  '/gate': GatePage,
  '/insurance': InsurancePage,
  '/market': MarketPage,
  '/explorer': ExplorerPage,
  '/findings': FindingsPage,
}

export function App() {
  const route = useRoute()
  const { error, clearError } = useWallet()
  const Page = PAGES[route]

  return (
    <div className="app">
      <header className="header">
        <a className="brand" href="#/">
          <span className="brand-name">TrustFlow</span>
          <span className="brand-sub">Invoice factoring + credit insurance on the XRP Ledger</span>
        </a>
        <div className="header-right">
          <span className="chip">{NETWORK.name}</span>
          {/* Opens xrpl-connect's modal. Once connected, Dashboard, The Gate and Market all
              submit single-signed TrustFlow transactions from this same wallet — see
              CLAUDE.md "The webapp" for the one exception (LoanSet, dual-signed). */}
          <WalletConnector />
        </div>
      </header>

      <Nav route={route} />

      <main className="main">
        {error && (
          <div className="panel panel-error">
            <strong>Wallet error</strong>
            <p>{error}</p>
            <button type="button" className="btn btn-ghost" onClick={clearError}>
              Dismiss
            </button>
          </div>
        )}

        <Page />
      </main>

      <footer className="footer muted">
        <span>
          Connect a wallet to deposit, withdraw, repay, post cover, accept a credential or trade
          protection — every one of those needs only your own signature. <code>LoanSet</code> stays
          scripted in <code>src/protocol/</code>: it is dual-signed (borrower + broker), which no
          single connected wallet can do alone.
        </span>
        <code>{NETWORK.wss}</code>
      </footer>
    </div>
  )
}
