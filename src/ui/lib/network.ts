/**
 * The one network this app talks to, kept free of any wallet-SDK import.
 *
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
