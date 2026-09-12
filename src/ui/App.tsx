import { AccountPanel } from './components/AccountPanel'
import { WalletConnectNotice } from './components/WalletConnectNotice'
import { WalletConnector } from './components/WalletConnector'
import { useWallet } from './wallet/WalletContext'
import { NETWORK } from './wallet/config'

export function App() {
  const { error, clearError } = useWallet()

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Tokenized Credit</h1>
          <p className="muted">Closed-end lending vault on the XRP Ledger</p>
        </div>
        <div className="header-right">
          <span className="chip">{NETWORK.name}</span>
          <WalletConnector />
        </div>
      </header>

      <main className="main">
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
