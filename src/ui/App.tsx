import type { ReactElement } from 'react'
import { Nav } from './components/Nav'
import { WalletConnector } from './components/WalletConnector'
import { Chip } from './components/Panel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dashboard } from './dashboard/Dashboard'
import { ExplorerPage } from './pages/ExplorerPage'
import { FindingsPage } from './pages/FindingsPage'
import { GatePage } from './pages/GatePage'
import { Home } from './pages/Home'
import { InsurancePage } from './pages/InsurancePage'
import { MarketPage } from './pages/MarketPage'
import { useRoute, type Route } from './lib/router'
import { useWallet } from './wallet/WalletContext'
import { NETWORK } from './lib/network'

const PAGES: Record<Route, () => ReactElement> = {
  '/': Home,
  '/dashboard': Dashboard,
  '/gate': GatePage,
  '/insurance': InsurancePage,
  '/market': MarketPage,
  '/explorer': ExplorerPage,
  '/findings': FindingsPage,
}

export function App() {
  const route = useRoute()
  const { error, clearError } = useWallet()
  const Page = PAGES[route]

  return (
    <div className="mx-auto flex min-h-screen max-w-[1180px] flex-col gap-5 px-5 pt-8 pb-14">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <a className="block text-inherit no-underline" href="#/">
          <span className="block text-[21px] font-bold tracking-tight">TrustFlow</span>
          <span className="text-muted-foreground mt-0.5 block text-[13px]">
            Invoice factoring + credit insurance on the XRP Ledger
          </span>
        </a>
        <div className="flex flex-wrap items-center gap-2.5">
          <Chip>{NETWORK.name}</Chip>
          {/* Opens xrpl-connect's modal. Once connected, Dashboard, The Gate and Market all
              submit single-signed TrustFlow transactions from this same wallet — see
              CLAUDE.md "The webapp" for the one exception (LoanSet, dual-signed). */}
          <WalletConnector />
        </div>
      </header>

      <Nav route={route} />

      <main className="flex flex-col gap-4">
        {error && (
          <Alert className="border-err/40" role="alert" aria-live="polite">
            <AlertTitle className="text-err">Wallet error</AlertTitle>
            <AlertDescription>
              <p className="wrap-anywhere">{error}</p>
              <Button type="button" variant="ghost" size="sm" onClick={clearError}>
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Page />
      </main>

      <footer className="border-border text-muted-foreground mt-auto flex flex-wrap justify-between gap-3 border-t pt-4 text-xs">
        <span className="max-w-[80ch]">
          Connect a wallet to deposit, withdraw, repay, post cover, accept a credential or trade protection — every one
          of those needs only your own signature. <code>LoanSet</code> stays scripted in <code>src/protocol/</code>: it
          is dual-signed (borrower + broker), which no single connected wallet can do alone.
        </span>
        <code>{NETWORK.wss}</code>
      </footer>
    </div>
  )
}
