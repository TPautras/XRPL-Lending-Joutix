import { useEffect, useRef, type CSSProperties } from 'react'
import type { WalletConnectorElement } from 'xrpl-connect'
import { useWallet } from '../wallet/WalletContext'
import { enabledWalletIds } from '../wallet/config'

const CONNECTOR_THEME = {
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
      <button
        type="button"
        className="btn btn-primary"
        disabled={isConnected}
        onClick={() => connector()?.open()}
      >
        {isConnected ? 'Wallet connected' : 'Connect wallet'}
      </button>

      <xrpl-wallet-connector
        ref={connectorRef}
        wallets={enabledWalletIds()}
        primary-wallet="crossmark"
        style={CONNECTOR_THEME}
      />
    </>
  )
}
