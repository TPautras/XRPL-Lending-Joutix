import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const STATE_PATH = join(REPO_ROOT, 'state', 'hackathon.json')
// Vite serves `public/` verbatim at the site root, so the dashboard can just
// `fetch('/state.json')` at runtime with no build-time import of a file that may not
// exist yet (state/hackathon.json only appears once `npm run demo setup` has run).
const DASHBOARD_COPY_PATH = join(REPO_ROOT, 'public', 'state.json')

export interface LoanState {
  loanId: string
  loanBrokerId: string
  paymentInterval: number
  gracePeriod: number
  startDate: number
}

export interface EscrowState {
  owner: string // insurer address — EscrowFinish/EscrowCancel's `Owner`
  offerSequence: number
  condition: string
  fulfillment: string
  cancelAfter: number
  destination: string // investorA address
  amount: string
  released?: boolean
  cancelled?: boolean
}

export interface HackathonState {
  mptIssuanceId?: string
  credentialType?: string
  domainId?: string
  vault?: { vaultId: string; shareMptId: string; private: boolean }
  loanBrokerId?: string
  loans: { A?: LoanState; B?: LoanState }
  insurance?: EscrowState
  txLog: Array<{ ts: string; type: string; result: string; hash: string }>
}

const EMPTY: HackathonState = { loans: {}, txLog: [] }

export function loadState(): HackathonState {
  if (!existsSync(STATE_PATH)) return structuredClone(EMPTY)
  return JSON.parse(readFileSync(STATE_PATH, 'utf-8')) as HackathonState
}

export function saveState(state: HackathonState): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true })
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
  // Mirrored into src/ui so the dashboard (served by Vite, browser-side) can read
  // the object IDs without a backend — see CLAUDE.md's "no wallet signing" dashboard.
  mkdirSync(dirname(DASHBOARD_COPY_PATH), { recursive: true })
  writeFileSync(DASHBOARD_COPY_PATH, JSON.stringify(state, null, 2))
}

export function resetState(): void {
  saveState(structuredClone(EMPTY))
}
