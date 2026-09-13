import { Panel } from './Panel'

/**
 * The XRPL Dev Wallet extension (github.com/oz-ross/xrpl-dev-wallet-extension) injects
 * nothing into the page — it pairs only over WalletConnect. Tested and confirmed a dead
 * end for this app, not merely unconfigured: even with a correct CAIP-2 `walletConnectId`
 * set (`lib/network.ts`), pairing against this custom devnet threw "Network mismatch.
 * Expected 'xrpl:4001' but wallet is connected to 'xrpl:0'" — the wallet's own session
 * only ever advertises the standard chains, never a custom `network_id`, and that is
 * outside this app's control. So WalletConnect is not offered in the connect modal at
 * all (`wallet/config.ts`); this says why, instead of leaving the wallet silently absent.
 */
export function WalletConnectNotice() {
  return (
    <Panel title="WalletConnect can't reach this devnet" tone="warn">
      <p className="text-sm">
        The <a href="https://github.com/oz-ross/xrpl-dev-wallet-extension" target="_blank" rel="noreferrer">XRPL
        Dev Wallet</a> extension pairs only over WalletConnect, and WalletConnect wallets only ever advertise the
        standard XRPL chains (mainnet/testnet/devnet) in their session — never this event&rsquo;s custom{' '}
        <code>network_id</code>. Pairing was tested here and failed with exactly that mismatch, so this app doesn&rsquo;t
        offer WalletConnect at all. Use <strong>Crossmark</strong> or <strong>GemWallet</strong> instead — both let
        you add this devnet as a custom network directly in the extension.
      </p>
    </Panel>
  )
}
