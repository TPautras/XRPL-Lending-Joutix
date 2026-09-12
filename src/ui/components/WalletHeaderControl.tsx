import { useEffect, useRef, useState } from 'react'
import { useWallet } from '../wallet/WalletContext'
import { ConnectWalletButton } from './ConnectWalletButton'
import { AccountPanel } from './AccountPanel'

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function WalletHeaderControl() {
  const { account, isConnected, balance } = useWallet()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isConnected) setDetailsOpen(false)
  }, [isConnected])

  useEffect(() => {
    if (!detailsOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setDetailsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [detailsOpen])

  if (!isConnected || !account) {
    return <ConnectWalletButton />
  }

  return (
    <div className="l-wallet" ref={rootRef}>
      <button
        type="button"
        className="l-wallet-pill"
        onClick={() => setDetailsOpen((open) => !open)}
      >
        <span className="l-wallet-balance">{balance !== null ? `${balance} XRP` : 'Loading…'}</span>
        <span className="l-wallet-address">{shortenAddress(account.address)}</span>
      </button>

      {detailsOpen && (
        <div className="l-wallet-dropdown">
          <AccountPanel />
        </div>
      )}
    </div>
  )
}
