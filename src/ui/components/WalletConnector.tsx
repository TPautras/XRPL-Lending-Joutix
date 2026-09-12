import { useEffect, useRef, type CSSProperties } from 'react'
import { Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WalletConnectorElement } from 'xrpl-connect'
import { useWallet } from '../wallet/WalletContext'
import { enabledWalletIds } from '../wallet/config'

/**
 * `display: none` hides the element's own connect button, which would otherwise sit
 * unstyled next to ours — two buttons doing the same thing. The element stays mounted and
 * keeps working: its modal is portalled onto `document.body` (`ensureOverlayPortal`), not
 * rendered inside the host, so `open()` still shows it.
 */
const CONNECTOR_THEME = {
  display: 'none',
  '--xc-background-color': '#12161f',
  '--xc-text-color': '#e7ecf5',
  '--xc-primary-color': '#4f8cff',
  '--xc-border-radius': '12px',
} as CSSProperties

/**
 * `<xrpl-wallet-connector>` is a custom element, not a React component: React renders
 * the tag, and the manager has to be handed over imperatively once the element has
 * upgraded. `customElements.whenDefined` is the only reliable signal — the ref is
 * populated before the element definition has necessarily loaded.
 */
export function WalletConnector() {
  const { walletManager, isConnected } = useWallet()
  // Typed as HTMLElement because that is what the JSX `ref` prop accepts; narrowed to
  // WalletConnectorElement at each call site.
  const connectorRef = useRef<HTMLElement | null>(null)

  const connector = () => connectorRef.current as WalletConnectorElement | null

  useEffect(() => {
    if (!walletManager) return
    let cancelled = false

    void customElements.whenDefined('xrpl-wallet-connector').then(() => {
      if (cancelled) return
      connector()?.setWalletManager(walletManager)
    })

    return () => {
      cancelled = true
    }
  }, [walletManager])

  return (
    <>
      <Button type="button" disabled={isConnected} onClick={() => connector()?.open()}>
        <Wallet /> {isConnected ? 'Wallet connected' : 'Connect wallet'}
      </Button>

      <xrpl-wallet-connector
        ref={connectorRef}
        wallets={enabledWalletIds()}
        primary-wallet="crossmark"
        style={CONNECTOR_THEME}
      />
    </>
  )
}
