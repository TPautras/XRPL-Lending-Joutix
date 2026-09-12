import { AccountPanel } from './components/AccountPanel'
import { WalletConnectNotice } from './components/WalletConnectNotice'
import { WalletConnector } from './components/WalletConnector'
import { Dashboard } from './dashboard/Dashboard'
import { useWallet } from './wallet/WalletContext'
import { NETWORK } from './wallet/config'

export function App() {
  const { error, clearError } = useWallet()

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>TrustFlow</h1>
          <p className="muted">Invoice factoring + credit insurance on the XRP Ledger</p>
        </div>
        <div className="header-right">
          <span className="chip">{NETWORK.name}</span>
          <WalletConnector />
        </div>
      </header>

      <main className="main">
        <Dashboard />

        {/* The wallet connector is not needed to run or watch the demo — every
            TrustFlow transaction is signed by the protocol scripts in src/protocol/
            using seeds from .env. It's kept here for anyone who wants to poke at the
            reserve manually with their own account. */}
        <AccountPanel />
        <WalletConnectNotice />

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
