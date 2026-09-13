import { CrossmarkAdapter, GemWalletAdapter, XamanAdapter, type WalletAdapter } from 'xrpl-connect'

// Re-exported so the wallet modules keep a single import site. The constant itself lives in
// `lib/network.ts`: importing it from here would pull `xrpl-connect` — and its import-time
// `window` access — into every page and formatter that only wants the explorer URL.
export { NETWORK } from '../lib/network'

const XAMAN_API_KEY = import.meta.env.VITE_XAMAN_API_KEY

/**
 * WalletConnect is deliberately not offered here, confirmed a dead end for this app rather
 * than merely undocumented: pairing a WalletConnect wallet against this custom devnet threw
 * "Network mismatch. Expected 'xrpl:4001' but wallet is connected to 'xrpl:0'" even with a
 * correct CAIP-2 `walletConnectId` set (`lib/network.ts`) — the wallet's own session only
 * ever advertises the standard chains (`xrpl:0`/`1`/`2`), never a custom `network_id`, which
 * is outside this app's control. That's the same reason the XRPL Dev Wallet extension
 * (github.com/oz-ross/xrpl-dev-wallet-extension, WalletConnect-only — it injects no page
 * global) can't reach this devnet either. See `docs/FRICTION.md` for the full trail.
 */

/**
 * Crossmark and GemWallet are unconditional: they are browser extensions, need no
 * API key, and are the two that actually talk to Devnet. Xaman needs a credential, so
 * it is only offered once one is configured — registering it without a key makes the
 * wallet appear in the modal and then fail on click.
 */
export function buildAdapters(): WalletAdapter[] {
  const adapters: WalletAdapter[] = [new CrossmarkAdapter(), new GemWalletAdapter()]

  if (XAMAN_API_KEY) adapters.push(new XamanAdapter({ apiKey: XAMAN_API_KEY }))

  return adapters
}

/** Wallet ids offered in the modal, in order, matching `buildAdapters()`. */
export function enabledWalletIds(): string {
  const ids = ['crossmark', 'gemwallet']
  if (XAMAN_API_KEY) ids.push('xaman')
  return ids.join(',')
}
