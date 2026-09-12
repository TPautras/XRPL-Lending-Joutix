import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { WalletProvider } from './wallet/WalletContext'
import './styles.css'
import './landing.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root not found in index.html')

createRoot(container).render(
  <StrictMode>
    <WalletProvider>
      <App />
    </WalletProvider>
  </StrictMode>,
)
