import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { LedgerProvider } from './lib/ledger'
import { WalletProvider } from './wallet/WalletContext'
// Self-hosted, not a Google Fonts <link>: this app is demoed on venue wifi that has already
// dropped mid-pitch once (see docs/FRICTION.md), and a typeface is not something to gamble on.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
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
