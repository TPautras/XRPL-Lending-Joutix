import { CrossmarkAdapter, GemWalletAdapter, WalletConnectAdapter, XamanAdapter } from 'xrpl-connect'

/**
 * TrustFlow (Track 1) runs on the Custom Hackathon Devnet, not `xrpl-connect`'s
 * `STANDARD_NETWORKS.devnet` (public Devnet) — the two do not share ledger state, so a
 * wallet pointed at the wrong one would sign against an empty ledger. There is no
 * standard CAIP-2 id for this network; `walletConnectId` is left undefined, which
 * means the XRPL Dev Wallet extension (WalletConnect-only) cannot target it — that
 * extension only advertises the three standard chains. Crossmark/GemWallet can still
 * add a custom network manually and connect.
 */
export const NETWORK = {
  id: 'hackathon-devnet',
  name: 'Lending Hackathon Devnet',
  wss: 'wss://lending-hackathon.dev.ripplex.io:51233',
  rpc: 'https://lending-hackathon.dev.ripplex.io:51234',
  explorer: 'https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233',
}

const XAMAN_API_KEY = import.meta.env.VITE_XAMAN_API_KEY
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID

/**
 * WalletConnect is the only transport that reaches the XRPL Dev Wallet extension
 * (github.com/oz-ross/xrpl-dev-wallet-extension). That extension registers no content
 * script and injects no page global, so no detection-based adapter can ever see it —
 * it pairs by pasting the dApp's `wc:` URI into its popup. Without a project id the
 * adapter cannot be constructed, and the wallet is simply absent from the modal.
 */
export const WALLETCONNECT_ENABLED = Boolean(WALLETCONNECT_PROJECT_ID)

/**
 * Crossmark and GemWallet are unconditional: they are browser extensions, need no
 * API key, and are the two that actually talk to Devnet. Xaman and WalletConnect
 * each require a credential, so they are only offered once one is configured —
 * registering them without a key makes the wallet appear in the modal and then
 * fail on click.
 */
export function buildAdapters(): unknown[] {
  const adapters: unknown[] = [new CrossmarkAdapter(), new GemWalletAdapter()]

  if (XAMAN_API_KEY) adapters.push(new XamanAdapter({ apiKey: XAMAN_API_KEY }))
  if (WALLETCONNECT_PROJECT_ID) {
    adapters.push(new WalletConnectAdapter({ projectId: WALLETCONNECT_PROJECT_ID }))
  }

  return adapters
}

/** Wallet ids offered in the modal, in order, matching `buildAdapters()`. */
export function enabledWalletIds(): string {
  const ids = ['crossmark', 'gemwallet']
  if (XAMAN_API_KEY) ids.push('xaman')
  if (WALLETCONNECT_PROJECT_ID) ids.push('walletconnect')
  return ids.join(',')
}
