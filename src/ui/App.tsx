import { AccountPanel } from './components/AccountPanel'
import { WalletConnectNotice } from './components/WalletConnectNotice'
import { WalletConnector } from './components/WalletConnector'
import { Dashboard } from './dashboard/Dashboard'
import { Gate } from './pages/Gate'
import { Home } from './pages/Home'
import { BUILT, ROUTES, href, useRoute } from './router'
import { useWallet } from './wallet/WalletContext'
import { NETWORK } from './wallet/config'

export function App() {
  const { error, clearError } = useWallet()
  const route = useRoute()
  // The connect button belongs only where a wallet could plausibly be used to inspect
  // the reserve. On Home and Gate nothing is interactive, and an idle wallet prompt
  // invites the one gesture the webapp does not support — signing from the browser.
  const showWallet = route === '/dashboard'

  return (
    <div className={`app${route === '/dashboard' ? '' : ' app-wide'}`}>
      <header className="header">
        <div>
          <h1>
            <a href={href('/')}>TrustFlow</a>
          </h1>
          <p className="muted">Invoice factoring + credit insurance on the XRP Ledger</p>
        </div>
        <div className="header-right">
          <span className="chip">{NETWORK.name}</span>
          {showWallet && <WalletConnector />}
        </div>
      </header>

      <nav className="nav">
        {BUILT.map((r) => (
          <a key={r} href={href(r)} className={`nav-link${r === route ? ' nav-link-active' : ''}`}>
            {ROUTES[r]}
          </a>
        ))}
      </nav>

      <main className="main">
        {route === '/' && <Home />}
        {route === '/gate' && <Gate />}
        {route === '/dashboard' && (
          <>
            <Dashboard />

            {/* The wallet connector is not needed to run or watch the demo — every
                TrustFlow transaction is signed by the protocol scripts in src/protocol/
                using seeds from .env. It's kept here for anyone who wants to poke at the
                reserve manually with their own account. */}
            <AccountPanel />
            <WalletConnectNotice />
          </>
        )}

        {error && (
          <div className="panel panel-error">
            <strong>Wallet error</strong>
            <p>{error}</p>
            <button type="button" className="btn btn-ghost" onClick={clearError}>
              Dismiss
            </button>
          </div>
        )}
      </main>

      <footer className="footer muted">
        <code>{NETWORK.wss}</code>
      </footer>
    </div>
  )
}
