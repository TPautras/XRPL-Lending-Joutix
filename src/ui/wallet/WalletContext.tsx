import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { WalletManager, type AccountInfo, type WalletError } from 'xrpl-connect'
import { buildAdapters, NETWORK } from './config'

export interface ConnectedAccount {
  address: string
  networkId: string
  networkName: string
  /** The wallet's actual reported endpoint — the reliable way to tell whether a
   * connected account is really on this app's devnet. `networkId` is not: for a
   * user-configured custom network, GemWallet's `id` is always the generic string
   * `"xrpl-custom"` regardless of which node it points at (see `lib/network.ts`), so
   * `wrongNetwork` checks in the UI must compare this instead. */
  networkWss: string
  walletId: string
  walletName: string
}

interface WalletContextValue {
  walletManager: WalletManager | null
  account: ConnectedAccount | null
  isConnected: boolean
  error: string | null
  disconnect: () => Promise<void>
  clearError: () => void
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined)

export function WalletProvider({ children }: { children: ReactNode }) {
  // One manager for the lifetime of the app. Built lazily so React's StrictMode
  // double-render does not create two managers racing over the same storage key.
  const [walletManager] = useState(
    () =>
      new WalletManager({
        adapters: buildAdapters(),
        network: NETWORK, // a custom NetworkInfo, not one of xrpl-connect's presets — see config.ts
        autoConnect: true,
        // 'debug' rather than 'info': the UI only ever shows `error.message`, a single
        // line, while a wallet's own failure (e.g. Crossmark/GemWallet's connect-time
        // network check) can carry a fuller `originalError`/stack that only ever reaches
        // this console — see `onError` below, which logs it in full.
        logger: { level: 'debug' },
      }),
  )

  const [account, setAccount] = useState<ConnectedAccount | null>(null)
  const [error, setError] = useState<string | null>(null)

  // `readState` is referenced by the effect below and must not change identity,
  // or every render would tear down and re-register the event handlers.
  const managerRef = useRef(walletManager)
  managerRef.current = walletManager

  const readState = useCallback(() => {
    const manager = managerRef.current
    const current = manager.account
    const wallet = manager.wallet

    if (!manager.connected || !current) {
      setAccount(null)
      return
    }

    setAccount({
      address: current.address,
      networkId: current.network?.id ?? NETWORK.id,
      networkName: current.network?.name ?? NETWORK.name,
      networkWss: current.network?.wss ?? NETWORK.wss,
      walletId: wallet?.id ?? 'unknown',
      walletName: wallet?.name ?? 'Unknown wallet',
    })
  }, [])

  useEffect(() => {
    const onConnect = (account: AccountInfo) => {
      setError(null)
      console.debug('[wallet] connect event', account)
      readState()
    }
    const onDisconnect = () => readState()
    const onNetworkChanged = () => readState()
    const onError = (err: WalletError) => {
      setError(err.code ? `${err.code}: ${err.message}` : err.message)
      // The banner shows one line; `toJSON()` carries the rest — `category` and
      // `originalError` (with its own stack) — so a failure like Crossmark/GemWallet's
      // connect-time network check can be diagnosed from devtools without reproducing
      // it again with extra instrumentation.
      console.error('[wallet] error event', err.toJSON())
    }

    walletManager.on('connect', onConnect)
    walletManager.on('disconnect', onDisconnect)
    walletManager.on('networkChanged', onNetworkChanged)
    walletManager.on('error', onError)

    // `autoConnect` may have restored a session before these handlers existed.
    readState()

    return () => {
      walletManager.off('connect', onConnect)
      walletManager.off('disconnect', onDisconnect)
      walletManager.off('networkChanged', onNetworkChanged)
      walletManager.off('error', onError)
    }
  }, [walletManager, readState])

  const disconnect = useCallback(async () => {
    try {
      await walletManager.disconnect()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      readState()
    }
  }, [walletManager, readState])

  const clearError = useCallback(() => setError(null), [])

  const value = useMemo(
    () => ({
      walletManager,
      account,
      isConnected: account !== null,
      error,
      disconnect,
      clearError,
    }),
    [walletManager, account, error, disconnect, clearError],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext)
  if (!context) throw new Error('useWallet must be used within a WalletProvider')
  return context
}
