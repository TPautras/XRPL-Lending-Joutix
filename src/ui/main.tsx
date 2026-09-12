import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { LedgerProvider } from './lib/ledger'
import { WalletProvider } from './wallet/WalletContext'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root not found in index.html')

createRoot(container).render(
  <StrictMode>
    <WalletProvider>
      {/* One WebSocket for every screen: switching pages mid-pitch must not drop the
          ledger subscription and re-handshake. */}
      <LedgerProvider>
        <App />
      </LedgerProvider>
    </WalletProvider>
  </StrictMode>,
)
