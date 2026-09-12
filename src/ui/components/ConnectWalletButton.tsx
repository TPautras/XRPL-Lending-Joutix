import { useWallet } from '../wallet/WalletContext'

interface ConnectWalletButtonProps {
  className?: string
  label?: string
}

export function ConnectWalletButton({
  className = 'l-btn l-btn-primary',
  label = 'Connect wallet',
}: ConnectWalletButtonProps) {
  const { openConnector } = useWallet()

  return (
    <button type="button" className={className} onClick={openConnector}>
      {label}
    </button>
  )
}
