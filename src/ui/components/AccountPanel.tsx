import { useState } from 'react'
import { useWallet } from '../wallet/WalletContext'
import { NETWORK } from '../wallet/config'

function explorerUrl(address: string): string {
  return `https://devnet.xrpl.org/accounts/${address}`
}

export function AccountPanel() {
  const { account, disconnect } = useWallet()
  const [copied, setCopied] = useState(false)

  if (!account) {
    return (
      <div className="panel panel-empty">
        <p className="status status-off">
          <span className="dot" /> No wallet connected
        </p>
        <p className="muted">
          Connect a Crossmark or GemWallet account on {NETWORK.name} to act as an issuer,
          broker, borrower or investor.
        </p>
      </div>
    )
  }

  // The wallet may well be pointed at Mainnet or Testnet; the vault and lending
  // amendments only exist on Devnet, so say so rather than failing later at signing.
  const wrongNetwork = account.networkId !== NETWORK.id

  // xrpl-connect's WalletConnect adapter always opens a fresh pairing request on
  // reconnect instead of resuming an approved session (confirmed in docs/SEAMS.md,
  // and true through the library's current unreleased changelog — not a bug in the
  // pinned version, an accepted adapter limitation). So a reload always disconnects
  // this wallet; say so instead of leaving it looking like a random failure.
  const isWalletConnect = account.walletId === 'walletconnect'

  const copy = async () => {
    await navigator.clipboard.writeText(account.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="panel">
      <p className="status status-on">
        <span className="dot" /> Wallet connected
      </p>

      <dl className="fields">
        <dt>Address</dt>
        <dd>
          <code>{account.address}</code>
          <button type="button" className="btn btn-ghost" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </dd>

        <dt>Wallet</dt>
        <dd>{account.walletName}</dd>

        <dt>Network</dt>
        <dd>
          {account.networkName} <span className="muted">({account.networkId})</span>
          {wrongNetwork && (
            <span className="warn">
              — switch to {NETWORK.name}; the vault and lending amendments are Devnet-only
            </span>
          )}
        </dd>
      </dl>

      {isWalletConnect && (
        <p className="warn warn-block">
          WalletConnect sessions don&rsquo;t survive a reload — refreshing this page will
          disconnect the wallet and you&rsquo;ll need to pair a new <code>wc:</code> URI. This
          is a limitation of the connector, not this app.
        </p>
      )}

      <div className="actions">
        <a
          className="btn btn-ghost"
          href={explorerUrl(account.address)}
          target="_blank"
          rel="noreferrer"
        >
          View on explorer
        </a>
        <button type="button" className="btn btn-ghost" onClick={() => void disconnect()}>
          Disconnect
        </button>
      </div>
    </div>
  )
}
