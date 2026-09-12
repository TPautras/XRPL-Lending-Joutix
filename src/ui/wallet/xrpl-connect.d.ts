/**
 * Hand-written types for `xrpl-connect@0.8.2`.
 *
 * The package ships NO .d.ts — `node_modules/xrpl-connect/` contains only the two
 * bundles and a package.json with no `types` field — despite the npm description
 * advertising "full TypeScript support". These declarations were derived from the
 * export list of `xrpl-connect.mjs` and the runtime shapes in the bundle, not from
 * a published .d.ts. If a member is missing here, check the bundle before adding it.
 * See docs/SEAMS.md.
 */
declare module 'xrpl-connect' {
  export interface NetworkInfo {
    id: string
    name: string
    wss: string
    rpc: string
    walletConnectId?: string
  }

  export interface AccountInfo {
    address: string
    publicKey?: string
    network: NetworkInfo
  }

  export interface WalletInfo {
    id: string
    name: string
    icon?: string
  }

  export interface WalletManagerError extends Error {
    code?: string
  }

  export type WalletManagerEvents = {
    connect: (account: AccountInfo) => void
    disconnect: () => void
    networkChanged: (network: NetworkInfo) => void
    error: (error: WalletManagerError) => void
  }

  export interface WalletManagerOptions {
    adapters: unknown[]
    /** 'mainnet' | 'testnet' | 'devnet', or a full NetworkInfo. */
    network?: string | NetworkInfo
    autoConnect?: boolean
    logger?: { level?: 'debug' | 'info' | 'warn' | 'error' | 'silent' }
  }

  /** `sign()`'s result. Which half is populated depends on the adapter: Crossmark and
   * GemWallet return a `tx_blob` ready to submit, others only a raw `signature`. */
  export interface SignedTransaction {
    tx_blob?: string
    hash?: string
    signature?: string
  }

  /** `signAndSubmit()`'s result — the wallet submitted it to its own network, so all we
   * get back is an identifier to look the outcome up with. */
  export interface SubmittedTransaction {
    hash?: string
    id?: string
  }

  export class WalletManager {
    constructor(options: WalletManagerOptions)
    readonly connected: boolean
    readonly account: AccountInfo | null
    readonly wallet: WalletInfo | null
    connect(walletId: string, options?: Record<string, unknown>): Promise<AccountInfo>
    disconnect(): Promise<void>
    sign(tx: Record<string, unknown>): Promise<SignedTransaction>
    signAndSubmit(tx: Record<string, unknown>): Promise<SubmittedTransaction>
    on<K extends keyof WalletManagerEvents>(event: K, handler: WalletManagerEvents[K]): void
    off<K extends keyof WalletManagerEvents>(event: K, handler: WalletManagerEvents[K]): void
  }

  export class CrossmarkAdapter {
    constructor(options?: Record<string, unknown>)
  }
  export class GemWalletAdapter {
    constructor(options?: Record<string, unknown>)
  }
  export class XamanAdapter {
    constructor(options: { apiKey: string })
  }
  export class WalletConnectAdapter {
    constructor(options: { projectId: string })
  }
  export class LedgerAdapter {
    constructor(options?: Record<string, unknown>)
  }

  export const STANDARD_NETWORKS: Record<'mainnet' | 'testnet' | 'devnet', NetworkInfo>

  /** The `<xrpl-wallet-connector>` custom element. */
  export class WalletConnectorElement extends HTMLElement {
    setWalletManager(manager: WalletManager): void
    open(): void
    close(): void
  }
}
