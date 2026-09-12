import { useState } from 'react'
import { Copy, ExternalLink, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from './Panel'
import { Field, Fields } from './Figures'
import { useWallet } from '../wallet/WalletContext'
import { NETWORK } from '../lib/network'

function explorerUrl(address: string): string {
  return `${NETWORK.explorer}/accounts/${address}`
}

export function AccountPanel() {
  const { account, disconnect } = useWallet()
  const [copied, setCopied] = useState(false)

  if (!account) {
    return (
      <Panel title="No wallet connected" tone="off">
        <p className="text-muted-foreground text-sm">
          Connect a Crossmark or GemWallet account on {NETWORK.name} to act as an issuer, broker, borrower or investor.
        </p>
      </Panel>
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
    <Panel title="Wallet connected" tone={wrongNetwork ? 'warn' : 'on'}>
      <Fields>
        <Field label="Address">
          <code className="wrap-anywhere">{account.address}</code>
          <Button type="button" variant="ghost" size="sm" onClick={copy}>
            <Copy /> {copied ? 'Copied' : 'Copy'}
          </Button>
        </Field>
        <Field label="Wallet">{account.walletName}</Field>
        <Field label="Network" tone={wrongNetwork ? 'warn' : undefined}>
          <span>
            {account.networkName} <span className="text-muted-foreground">({account.networkId})</span>
          </span>
          {wrongNetwork && (
            <span className="text-warn text-[13px]">
              — switch to {NETWORK.name}; the vault and lending amendments are Devnet-only
            </span>
          )}
        </Field>
      </Fields>

      {isWalletConnect && (
        <p className="border-warn/30 bg-warn-soft text-warn mt-4 rounded-lg border px-3 py-2.5 text-[13px]">
          WalletConnect sessions don&rsquo;t survive a reload — refreshing this page will disconnect the wallet and
          you&rsquo;ll need to pair a new <code className="text-foreground">wc:</code> URI. This is a limitation of the
          connector, not this app.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2.5">
        <Button asChild variant="outline" size="sm">
          <a href={explorerUrl(account.address)} target="_blank" rel="noreferrer">
            <ExternalLink /> View on explorer
          </a>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => void disconnect()}>
          <LogOut /> Disconnect
        </Button>
      </div>
    </Panel>
  )
}
