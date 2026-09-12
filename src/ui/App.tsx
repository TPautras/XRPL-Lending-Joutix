import type { ReactElement } from 'react'
import { Nav } from './components/Nav'
import { WalletConnector } from './components/WalletConnector'
import { Dashboard } from './dashboard/Dashboard'
import { ExplorerPage } from './pages/ExplorerPage'
import { FindingsPage } from './pages/FindingsPage'
import { GatePage } from './pages/GatePage'
import { Home } from './pages/Home'
import { InsurancePage } from './pages/InsurancePage'
import { useRoute, type Route } from './lib/router'
import { useWallet } from './wallet/WalletContext'
import { NETWORK } from './lib/network'

const PAGES: Record<Route, () => ReactElement> = {
  '/': Home,
  '/dashboard': Dashboard,
  '/gate': GatePage,
  '/insurance': InsurancePage,
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
          {/* The only wallet-facing control in the app. It opens xrpl-connect's modal and
              nothing else: no screen here submits a TrustFlow transaction (CLAUDE.md). */}
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
          Read-only by construction — every transaction is signed by <code>src/protocol/</code>,
          never by this page.
        </span>
        <code>{NETWORK.wss}</code>
      </footer>
    </div>
  )
}
