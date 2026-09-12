import { useEffect, useState } from 'react'
import { Client } from 'xrpl'
import { NETWORK } from '../wallet/config'

/** Mirrors src/protocol/lib/state.ts's HackathonState — written to public/state.json
 * by the protocol scripts, polled here since it may not exist yet when this app
 * starts and Vite can't statically import a file that doesn't exist at build time. */
interface HackathonState {
  mptIssuanceId?: string
  vault?: { vaultId: string; shareMptId: string; private: boolean }
  loanBrokerId?: string
  loans: { A?: { loanId: string }; B?: { loanId: string } }
  insurance?: { released?: boolean; cancelled?: boolean }
}

export interface VaultView {
  assetsTotal: number
  assetsAvailable: number
  lossUnrealized: number
  outstandingShares: number
  sharePrice: number
}

export interface BrokerView {
  debtTotal: string
  coverAvailable: string
  coverRateMinimum: number
}

export interface LoanView {
  loanId: string
  status: 'active' | 'impaired' | 'defaulted'
  principalOutstanding: string
  totalValueOutstanding: string
  paymentRemaining: number
  nextPaymentDueDate: number
}

export interface DashboardView {
  connected: boolean
  ledgerIndex: number | null
  hasState: boolean
  vault: VaultView | null
  broker: BrokerView | null
  loans: Record<'A' | 'B', LoanView | null>
  insurance: { released: boolean; cancelled: boolean } | null
  events: string[]
}

const LOAN_DEFAULT_FLAG = 0x00010000
const LOAN_IMPAIRED_FLAG = 0x00020000

const EMPTY_VIEW: DashboardView = {
  connected: false,
  ledgerIndex: null,
  hasState: false,
  vault: null,
  broker: null,
  loans: { A: null, B: null },
  insurance: null,
  events: [],
}

function pushEvent(events: string[], line: string): string[] {
  return [line, ...events].slice(0, 20)
}

/** Read-only view of the whole TrustFlow demo, driven purely by RPC queries against
 * the hackathon devnet plus the object IDs the protocol scripts wrote to
 * public/state.json. Never signs or submits anything. */
export function useDashboard(): DashboardView {
  const [view, setView] = useState<DashboardView>(EMPTY_VIEW)

  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    let stateJson: HackathonState | null = null
    const client = new Client(NETWORK.wss)

    async function refresh() {
      if (cancelled || !stateJson) return
      const s = stateJson

      let vault: VaultView | null = null
      if (s.vault) {
        try {
          const { result } = await client.request({ command: 'vault_info', vault_id: s.vault.vaultId } as never)
          const v = (result as { vault: Record<string, unknown> }).vault
          const assetsTotal = Number(v.AssetsTotal ?? 0)
          const shares = Number((v.shares as { OutstandingAmount?: string } | undefined)?.OutstandingAmount ?? 0)
          vault = {
            assetsTotal,
            assetsAvailable: Number(v.AssetsAvailable ?? 0),
            lossUnrealized: Number(v.LossUnrealized ?? 0),
            outstandingShares: shares,
            sharePrice: shares > 0 ? assetsTotal / shares : 0,
          }
        } catch {
          // vault not created yet, or a transient RPC hiccup — next poll will retry
        }
      }

      let broker: BrokerView | null = null
      if (s.loanBrokerId) {
        try {
          const { result } = await client.request({
            command: 'ledger_entry',
            index: s.loanBrokerId,
            ledger_index: 'validated',
          } as never)
          const node = (result as { node: Record<string, unknown> }).node
          broker = {
            debtTotal: String(node.DebtTotal ?? '0'),
            coverAvailable: String(node.CoverAvailable ?? '0'),
            coverRateMinimum: Number(node.CoverRateMinimum ?? 0),
          }
        } catch {
          // broker not created yet
        }
      }

      const loans: DashboardView['loans'] = { A: null, B: null }
      for (const slot of ['A', 'B'] as const) {
        const loan = s.loans[slot]
        if (!loan) continue
        try {
          const { result } = await client.request({
            command: 'ledger_entry',
            index: loan.loanId,
            ledger_index: 'validated',
          } as never)
          const node = (result as { node: Record<string, unknown> }).node
          const flags = Number(node.Flags ?? 0)
          loans[slot] = {
            loanId: loan.loanId,
            status: flags & LOAN_DEFAULT_FLAG ? 'defaulted' : flags & LOAN_IMPAIRED_FLAG ? 'impaired' : 'active',
            principalOutstanding: String(node.PrincipalOutstanding ?? '0'),
            totalValueOutstanding: String(node.TotalValueOutstanding ?? '0'),
            paymentRemaining: Number(node.PaymentRemaining ?? 0),
            nextPaymentDueDate: Number(node.NextPaymentDueDate ?? 0),
          }
        } catch {
          // loan not created yet
        }
      }

      if (!cancelled) {
        setView((prev) => ({
          ...prev,
          hasState: true,
          vault,
          broker,
          loans,
          insurance: s.insurance
            ? { released: Boolean(s.insurance.released), cancelled: Boolean(s.insurance.cancelled) }
            : null,
        }))
      }
    }

    async function pollState() {
      try {
        const res = await fetch('/state.json', { cache: 'no-store' })
        if (res.ok) {
          stateJson = (await res.json()) as HackathonState
          await refresh()
        }
      } catch {
        // public/state.json doesn't exist until `npm run demo setup` has run once
      }
      if (!cancelled) pollTimer = setTimeout(pollState, 5000)
    }

    async function connect() {
      try {
        await client.connect()
        if (cancelled) return
        setView((prev) => ({ ...prev, connected: true, events: pushEvent(prev.events, 'Connected to hackathon devnet') }))
        await client.request({ command: 'subscribe', streams: ['ledger'] } as never)
        client.on('ledgerClosed', (ledger: unknown) => {
          const index = Number((ledger as { ledger_index?: number }).ledger_index ?? 0)
          setView((prev) => ({ ...prev, ledgerIndex: index, events: pushEvent(prev.events, `Ledger ${index} closed`) }))
          void refresh()
        })
      } catch (err) {
        if (!cancelled) {
          setView((prev) => ({ ...prev, events: pushEvent(prev.events, `Connection error: ${String(err)}`) }))
        }
      }
    }

    void connect()
    void pollState()

    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
      void client.disconnect()
    }
  }, [])

  return view
}
