/**
 * The one network this app talks to, kept free of any wallet-SDK import.
 *
 * TrustFlow (Track 1) runs on the Custom Hackathon Devnet, not `xrpl-connect`'s
 * `STANDARD_NETWORKS.devnet` (public Devnet) — the two do not share ledger state, so a
 * wallet pointed at the wrong one would sign against an empty ledger. Crossmark/GemWallet
 * can add a custom network manually in the extension itself and connect. WalletConnect
 * cannot, even with a correct CAIP-2 `walletConnectId` (`xrpl:4001`, this devnet's real
 * `network_id`) set here: tested and confirmed the paired wallet's own session only ever
 * advertises the standard chains, never a custom one — "Network mismatch. Expected
 * 'xrpl:4001' but wallet is connected to 'xrpl:0'" — so `wallet/config.ts` doesn't offer
 * it at all. Full trail: `docs/FRICTION.md`.
 *
 * `id` is `'xrpl-custom'`, not a name of our choosing, and that's forced, not a
 * preference: `@gemwallet/api`'s `getNetwork()` only ever reports `{chain: "XRPL",
 * network: "Custom", websocket}` for ANY user-configured custom node — it carries no
 * label of its own — and xrpl-connect's `GemWalletAdapter.toNetworkInfo()` builds the
 * `NetworkInfo.id` it checks against as `${chain}-${network}`.toLowerCase(), i.e.
 * always literally `"xrpl-custom"`, regardless of which endpoint the wallet is
 * actually pointed at. `WalletManager` enforces this `id` at `connect()` time and
 * throws before an account is ever returned, so any other `id` here makes GemWallet
 * connection fail with "Network mismatch. Expected ... but wallet is connected to
 * xrpl-custom" no matter what the user configures (docs/FRICTION.md). Matching that
 * generic string is necessary for GemWallet to connect at all — see
 * `wallet/WalletContext.tsx` for the real check this app does afterward, comparing
 * `wss` (which IS the real endpoint, unlike `id`) rather than trusting `id` alone.
 */
export const NETWORK = {
  id: 'xrpl-custom',
  name: 'Lending Hackathon Devnet',
  wss: 'wss://lending-hackathon.dev.ripplex.io:51233',
  rpc: 'https://lending-hackathon.dev.ripplex.io:51234',
  explorer: 'https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233',
}

/**
 * The one write-path exception to "two data sources, no third": `LoanSet`'s
 * counter-signature (see docs/plans/loanset-signing-service.md) can only be produced by
 * `server/loan-signer`, a small dedicated service holding the broker's key. Everything
 * else this app does still goes straight to `NETWORK` or `public/state.json`.
 */
export const LOAN_SIGNER_URL = import.meta.env.VITE_LOAN_SIGNER_URL ?? 'http://localhost:8788/loanset/countersign'
