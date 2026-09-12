import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  WalletManager,
  type AccountInfo,
  type WalletConnectorElement,
  type WalletManagerError,
} from 'xrpl-connect'
import { Client, dropsToXrp } from 'xrpl'
import { buildAdapters, enabledWalletIds, NETWORK } from './config'

const CONNECTOR_THEME = {
  '--xc-background-color': '#12161f',
  '--xc-text-color': '#e7ecf5',
  '--xc-primary-color': '#17335c',
  '--xc-border-radius': '12px',
} as CSSProperties

export interface ConnectedAccount {
  address: string
  networkId: string
  networkName: string
  walletId: string
  walletName: string
}

interface WalletContextValue {
  walletManager: WalletManager | null
  account: ConnectedAccount | null
  isConnected: boolean
  /** XRP balance of the connected account, as a decimal string. Null while loading,
   *  unfetched, or if the account has never been funded (reads as actNotFound). */
  balance: string | null
  error: string | null
  /** Opens the one app-wide connector modal. Every "Connect wallet" trigger calls
   *  this instead of mounting its own `<xrpl-wallet-connector>` element. */
  openConnector: () => void
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
        network: NETWORK.id,
        autoConnect: true,
        logger: { level: 'info' },
      }),
  )

  const [account, setAccount] = useState<ConnectedAccount | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState<string | null>(null)

  // The single `<xrpl-wallet-connector>` instance for the whole app — every trigger
  // calls `openConnector` instead of mounting its own element, so opening the modal
  // from two places at once cannot ever produce two overlapping modals. Typed as
  // HTMLElement because that is what the JSX `ref` prop accepts; narrowed to
  // WalletConnectorElement at each call site.
  const connectorRef = useRef<HTMLElement | null>(null)
  const connectorEl = () => connectorRef.current as WalletConnectorElement | null
  const openConnector = useCallback(() => connectorEl()?.open(), [])

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
      walletId: wallet?.id ?? 'unknown',
      walletName: wallet?.name ?? 'Unknown wallet',
    })
  }, [])

  const fetchBalance = useCallback(async (address: string) => {
    const client = new Client(NETWORK.wss)
    try {
      await client.connect()
      const response = await client.request({
        command: 'account_info',
        account: address,
        ledger_index: 'validated',
      })
      setBalance(dropsToXrp(response.result.account_data.Balance).toString())
    } catch (err) {
      // A never-funded Devnet account rejects with actNotFound rather than a zero
      // balance — that reads as "0 XRP", not as a fetch failure.
      const unfunded = err instanceof Error && err.message.includes('actNotFound')
      setBalance(unfunded ? '0' : null)
    } finally {
      if (client.isConnected()) await client.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!account) {
      setBalance(null)
      return
    }
    void fetchBalance(account.address)
  }, [account, fetchBalance])

  useEffect(() => {
    let cancelled = false
    void customElements.whenDefined('xrpl-wallet-connector').then(() => {
      if (cancelled) return
      connectorEl()?.setWalletManager(walletManager)
    })
    return () => {
      cancelled = true
    }
  }, [walletManager])

  useEffect(() => {
    const onConnect = (_account: AccountInfo) => {
      setError(null)
      readState()
    }
    const onDisconnect = () => readState()
    const onNetworkChanged = () => readState()
    const onError = (err: WalletManagerError) => {
      setError(err.code ? `${err.code}: ${err.message}` : err.message)
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
      balance,
      error,
      openConnector,
      disconnect,
      clearError,
    }),
    [walletManager, account, balance, error, openConnector, disconnect, clearError],
  )

  return (
    <WalletContext.Provider value={value}>
      {children}
      <xrpl-wallet-connector
        ref={connectorRef}
        wallets={enabledWalletIds()}
        primary-wallet="crossmark"
        style={CONNECTOR_THEME}
      />
    </WalletContext.Provider>
  )
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext)
  if (!context) throw new Error('useWallet must be used within a WalletProvider')
  return context
}
