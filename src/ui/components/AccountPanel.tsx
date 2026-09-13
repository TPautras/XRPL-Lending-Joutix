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
  // Compared by `wss`, not `networkId`: GemWallet reports the same generic
  // `"xrpl-custom"` id for any user-configured custom node, so the endpoint URL is the
  // only reliable signal for a custom network (see `lib/network.ts`).
  const wrongNetwork = account.networkWss !== NETWORK.wss

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
