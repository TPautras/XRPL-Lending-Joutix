import { useState } from 'react'
import type { SubmittableTransaction } from 'xrpl'
import { NeedsDemo, Panel, SectionHeading } from '../components/Panel'
import { AddressLink, TxLink } from '../components/TxLink'
import { useAppState, type AppState } from '../lib/appState'
import { useLedger } from '../lib/ledger'
import { useMptBalance, useRedeemable, useWalletSubmit } from '../lib/walletActions'
import { useXrpBalance } from '../lib/market'
import { useProtection, type ProtectionView } from '../lib/protection'
import {
  clockTime,
  countdown,
  coverRatePercent,
  eur,
  eurToBaseUnits,
  fillPercent,
  isoToClock,
  lessThanBase,
  minimumCover,
  sharePrice,
  subtractBase,
  units,
  xrp,
} from '../lib/format'
import { hrefFor } from '../lib/router'
import { useWallet } from '../wallet/WalletContext'
import { useDashboard, type BrokerView, type DashboardData, type LoanView, type VaultView } from './useDashboard'

function ReservePanel({ vault }: { vault: VaultView | null }) {
  if (!vault) {
    return (
      <Panel title="Reserve" tone="off">
        <NeedsDemo what="The vault does not exist yet" command="npm run demo setup" />
      </Panel>
    )
  }

  const price = sharePrice(vault.assetsTotal, vault.outstandingShares, vault.assetScale, vault.shareScale)
  const lent = subtractBase(vault.assetsTotal, vault.assetsAvailable)
  const hasLoss = Number(vault.lossUnrealized) > 0

  return (
    <Panel
      title="Reserve"
      aside={vault.private ? <span className="chip">private · domain-gated</span> : <span className="chip">open</span>}
    >
      <p className="metric">
        <span className="metric-value">{price ?? '—'}</span>
        <span className="metric-label">share price (assets per share)</span>
      </p>

      <div className="bar" title="Deployed into loans vs sitting idle">
        <span className="bar-fill" style={{ width: `${fillPercent(lent, vault.assetsTotal)}%` }} />
      </div>
      <p className="muted small">
        {eur(lent, vault.assetScale)} of {eur(vault.assetsTotal, vault.assetScale)} deployed into loans
      </p>

      <dl className="fields">
        <dt>Assets total</dt>
        <dd>{eur(vault.assetsTotal, vault.assetScale)}</dd>
        <dt>Available</dt>
        <dd>{eur(vault.assetsAvailable, vault.assetScale)}</dd>
        <dt>Unrealized loss</dt>
        <dd className={hasLoss ? 'value-err' : undefined}>{eur(vault.lossUnrealized, vault.assetScale)}</dd>
        <dt>Shares out</dt>
        <dd>{units(vault.outstandingShares, vault.shareScale)}</dd>
      </dl>
    </Panel>
  )
}

function CushionPanel({
  broker,
  onPostCover,
  busy,
}: {
  broker: BrokerView | null
  onPostCover: (eurAmount: string) => void
  busy: boolean
}) {
  const { isConnected } = useWallet()
  const [amount, setAmount] = useState('500')

  if (!broker) {
    return (
      <Panel title="Manager cushion" tone="off">
        <NeedsDemo what="No loan broker yet" command="npm run demo setup" />
      </Panel>
    )
  }

  const required = minimumCover(broker.debtTotal, broker.coverRateMinimum)
  const short = lessThanBase(broker.coverAvailable, required)

  return (
    <Panel title="Manager cushion" tone={short ? 'warn' : 'on'} aside={<span className="chip">first-loss</span>}>
      <p className="metric">
        <span className={`metric-value ${short ? 'value-warn' : ''}`}>{eur(broker.coverAvailable)}</span>
        <span className="metric-label">cover posted by the manager</span>
      </p>

      <div className="bar" title="Cover available against the minimum the protocol requires">
        <span
          className={`bar-fill ${short ? 'bar-fill-warn' : 'bar-fill-ok'}`}
          style={{ width: `${fillPercent(broker.coverAvailable, required === '0' ? '1' : required)}%` }}
        />
      </div>

      <dl className="fields">
        <dt>Debt total</dt>
        <dd>{eur(broker.debtTotal)}</dd>
        <dt>Min required</dt>
        <dd>
          {eur(required)} <span className="muted">({coverRatePercent(broker.coverRateMinimum)} of debt)</span>
        </dd>
        <dt>Debt ceiling</dt>
        <dd>{Number(broker.debtMaximum) > 0 ? eur(broker.debtMaximum) : <span className="muted">unlimited</span>}</dd>
      </dl>
      <p className="muted small">
        This is the manager’s own money, and it absorbs a default before any investor does.
      </p>
      {isConnected && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            onPostCover(amount)
          }}
        >
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Cover amount in EUR" />
          <button type="submit" className="btn btn-ghost" disabled={busy}>
            Post cover (as manager)
          </button>
        </form>
      )}
    </Panel>
  )
}

const LOAN_TONE = { active: 'on', impaired: 'warn', defaulted: 'err' } as const
const LOAN_LABEL = { active: 'Active', impaired: 'Impaired', defaulted: 'Defaulted' } as const

function LoanCard({
  slot,
  loan,
  ledgerTime,
  onRepay,
  busy,
}: {
  slot: 'A' | 'B'
  loan: LoanView | null
  ledgerTime: number | null
  onRepay: (loan: LoanView) => void
  busy: boolean
}) {
  const { isConnected } = useWallet()

  if (!loan) {
    return (
      <Panel title={`Loan ${slot}`} tone="off">
        <NeedsDemo
          what="Not originated yet"
          command={slot === 'A' ? 'npm run demo s4' : 'npm run demo prestage'}
        />
      </Panel>
    )
  }

  const defaultableAt = loan.nextPaymentDueDate ? loan.nextPaymentDueDate + loan.gracePeriod : null
  const payable = loan.status !== 'defaulted' && loan.paymentRemaining > 0

  return (
    <Panel
      title={
        <>
          Loan {slot} <span className="muted">·</span> {LOAN_LABEL[loan.status]}
        </>
      }
      tone={LOAN_TONE[loan.status]}
      aside={<span className="chip">{loan.paymentRemaining} payment(s) left</span>}
    >
      <dl className="fields">
        <dt>Outstanding</dt>
        <dd>{eur(loan.principalOutstanding)}</dd>
        <dt>Total due</dt>
        <dd>{eur(loan.totalValueOutstanding)}</dd>
        <dt>Per payment</dt>
        <dd>{eur(loan.periodicPayment)}</dd>
        {loan.nextPaymentDueDate > 0 && (
          <>
            <dt>Next due</dt>
            <dd>
              {clockTime(loan.nextPaymentDueDate)}{' '}
              <span className="muted">{countdown(loan.nextPaymentDueDate, ledgerTime)}</span>
            </dd>
            <dt>Defaultable</dt>
            <dd className={loan.status === 'defaulted' ? 'value-err' : undefined}>
              {loan.status === 'defaulted' ? 'already defaulted' : countdown(defaultableAt, ledgerTime)}
            </dd>
          </>
        )}
      </dl>
      <p className="muted small">
        Grace period {loan.gracePeriod}s after the due date — measured in ledger time, not wall clock.
      </p>
      {isConnected && payable && (
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onRepay(loan)}>
            Repay {eur(loan.periodicPayment)} (as borrower)
          </button>
        </div>
      )}
    </Panel>
  )
}

const PROTECTION_TONE: Record<ProtectionView['phase'], 'on' | 'off' | 'warn' | 'err'> = {
  none: 'off',
  locked: 'on',
  released: 'on',
  expired: 'off',
  'settled elsewhere': 'warn',
}

const PROTECTION_LABEL: Record<ProtectionView['phase'], string> = {
  none: 'Not sold yet',
  locked: 'Locked — awaiting the outcome',
  released: 'Paid out to the protection buyer',
  expired: 'Expired — the insurer reclaimed the cover',
  'settled elsewhere': 'The escrow object is gone and the demo did not release it',
}

function ProtectionPanel({ protection }: { protection: ProtectionView | null }) {
  const view = protection ?? { phase: 'none' as const, amount: null, destination: null, owner: null, condition: null, cancelAfter: null, onLedger: false }

  return (
    <Panel title="Credit insurance" tone={PROTECTION_TONE[view.phase]} aside={<a className="chip chip-link" href={hrefFor('/insurance')}>the wall →</a>}>
      <p className="metric">
        <span className="metric-value">{view.amount ? eur(view.amount) : '—'}</span>
        <span className="metric-label">{PROTECTION_LABEL[view.phase]}</span>
      </p>
      {view.destination && (
        <dl className="fields">
          <dt>Buyer</dt>
          <dd>
            <AddressLink address={view.destination} />
          </dd>
          <dt>Insurer</dt>
          <dd>{view.owner ? <AddressLink address={view.owner} /> : '—'}</dd>
        </dl>
      )}
      {view.phase === 'none' && <NeedsDemo what="No protection on the books" command="npm run demo prestage" />}
    </Panel>
  )
}

function EventFeed() {
  const { events, ledgerIndex, status } = useLedger()

  return (
    <Panel
      title="Live feed"
      tone={status === 'online' ? 'on' : status === 'connecting' ? 'off' : 'err'}
      aside={ledgerIndex ? <span className="chip">ledger {ledgerIndex}</span> : null}
    >
      {events.length === 0 ? (
        <p className="muted">Waiting for the first ledger close…</p>
      ) : (
        <ul className="feed">
          {events.map((event) => (
            <li key={`${event.ts}-${event.text}`}>
              <span className="feed-ts">{isoToClock(event.ts)}</span>
              {event.text}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/**
 * The investor's own actions on the reserve — deposit, and redeem exactly what the
 * connected account's shares are worth right now (mirrors `flows/vault.ts withdrawMax()`,
 * not a face-value amount fixed at deposit time, since share price moves).
 */
function WalletPanel({
  vaultId,
  shareMptId,
  issuanceId,
  onDeposit,
  onWithdrawAll,
  busy,
}: {
  vaultId: string | undefined
  shareMptId: string | undefined
  issuanceId: string | undefined
  onDeposit: (eurAmount: string) => void
  onWithdrawAll: (redeemableBaseUnits: string) => void
  busy: boolean
}) {
  const { account, isConnected } = useWallet()
  const address = account?.address ?? null
  const [amount, setAmount] = useState('1000')

  const xrpBalance = useXrpBalance(address)
  const tfeurBalance = useMptBalance(address, issuanceId)
  const redeemable = useRedeemable(address, vaultId, shareMptId)

  if (!isConnected) {
    return (
      <Panel title="Your wallet" tone="off">
        <p className="muted">
          Use <strong>Connect wallet</strong> in the header to deposit into the reserve, repay a
          loan or post cover — from your own account, pointed at this devnet.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Your wallet"
      aside={
        <span className="chip">
          <AddressLink address={address ?? ''} /> · {xrp(xrpBalance.data, 2)}
        </span>
      }
    >
      <dl className="fields">
        <dt>TFEUR balance</dt>
        <dd>{eur(tfeurBalance.data)}</dd>
        {vaultId && (
          <>
            <dt>Redeemable now</dt>
            <dd>{eur(redeemable.data)}</dd>
          </>
        )}
      </dl>

      {vaultId && issuanceId && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            onDeposit(amount)
          }}
        >
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Deposit amount in EUR" />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Deposit into reserve
          </button>
        </form>
      )}
      {vaultId && (
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || !redeemable.data || redeemable.data === '0'}
            onClick={() => onWithdrawAll(redeemable.data ?? '0')}
          >
            Withdraw everything redeemable
          </button>
        </div>
      )}
      <p className="muted small">
        <code>VaultDeposit</code> needs an accepted <code>Credential</code> for this account if the
        reserve is private — a visitor without one gets <code>tecNO_AUTH</code>, which is the gate
        working, not a broken button. <code>VaultWithdraw</code> is never gated (see{' '}
        <a href={hrefFor('/gate')}>The Gate</a>).
      </p>
    </Panel>
  )
}

function SubmittedPanel({ log }: { log: ReturnType<typeof useWalletSubmit>['log'] }) {
  return (
    <Panel title="Submitted from this browser" tone={log.length ? 'on' : 'off'}>
      {log.length === 0 ? (
        <p className="muted">
          Nothing yet. Deposits, withdrawals, repayments and cover posted from a connected wallet
          on this page are recorded here, in this browser only.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Transaction</th>
                <th>Result</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry) => (
                <tr key={entry.hash}>
                  <td className="nowrap">{new Date(entry.ts).toLocaleTimeString()}</td>
                  <td>
                    <code>{entry.type}</code>
                    {entry.note && <span className="muted small"> — {entry.note}</span>}
                  </td>
                  <td>
                    <span className={`pill pill-${entry.result === 'tesSUCCESS' ? 'success' : 'failure'}`}>
                      <code>{entry.result}</code>
                    </span>
                  </td>
                  <td>
                    <TxLink hash={entry.hash} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function StateNotice({ state, error }: { state: AppState | null; error: string | null }) {
  if (state) return null
  return (
    <div className="panel panel-notice">
      <strong>No demo state yet</strong>
      <p>
        This screen reads object IDs from <code>public/state.json</code>, written by the protocol
        scripts. Run <code>npm run demo setup</code>, then <code>prestage</code> and{' '}
        <code>s1</code>…<code>s10</code>.
      </p>
      {error && <p className="muted small">Last fetch: {error}</p>}
    </div>
  )
}

/**
 * Pitch 1:00–3:00, and the screen the default trigger (`s9`) is performed against: the
 * cushion draining and `LossUnrealized` moving is the visual payload of the whole demo.
 * Every number here is read from the ledger on each close; nothing is computed from a
 * transaction we submitted, because the point is what the ledger says happened.
 */
export function Dashboard() {
  const { state, error } = useAppState()
  const { ledgerTime } = useLedger()
  const { data, error: rpcError } = useDashboard(state)
  const { data: protection } = useProtection(state)
  const { pending, error: txError, clearError, log, send } = useWalletSubmit()
  const { account } = useWallet()

  const view: DashboardData = data ?? { vault: null, broker: null, loans: { A: null, B: null } }
  const address = account?.address ?? null
  const vaultId = state?.vault?.vaultId
  const shareMptId = state?.vault?.shareMptId
  const issuanceId = state?.mptIssuanceId
  const loanBrokerId = state?.loanBrokerId
  const busy = pending !== null

  const deposit = (eurAmount: string) => {
    if (!address || !vaultId || !issuanceId) return
    const value = eurToBaseUnits(eurAmount)
    if (!value) return
    void send(
      { TransactionType: 'VaultDeposit', Account: address, VaultID: vaultId, Amount: { mpt_issuance_id: issuanceId, value } } as SubmittableTransaction,
      `deposit ${eurAmount} EUR`,
    )
  }

  const withdrawAll = (redeemableBaseUnits: string) => {
    if (!address || !vaultId || !issuanceId || redeemableBaseUnits === '0') return
    void send(
      {
        TransactionType: 'VaultWithdraw',
        Account: address,
        VaultID: vaultId,
        Amount: { mpt_issuance_id: issuanceId, value: redeemableBaseUnits },
      } as SubmittableTransaction,
      'withdraw everything redeemable',
    )
  }

  const repay = (loan: LoanView) => {
    if (!address || !issuanceId) return
    void send(
      {
        TransactionType: 'LoanPay',
        Account: address,
        LoanID: loan.loanId,
        Amount: { mpt_issuance_id: issuanceId, value: loan.periodicPayment },
      } as SubmittableTransaction,
      `repay loan ${loan.loanId.slice(0, 8)}…`,
    )
  }

  const postCover = (eurAmount: string) => {
    if (!address || !loanBrokerId || !issuanceId) return
    const value = eurToBaseUnits(eurAmount)
    if (!value) return
    void send(
      {
        TransactionType: 'LoanBrokerCoverDeposit',
        Account: address,
        LoanBrokerID: loanBrokerId,
        Amount: { mpt_issuance_id: issuanceId, value },
      } as SubmittableTransaction,
      `post ${eurAmount} EUR cover`,
    )
  }

  return (
    <div className="page">
      <SectionHeading sub="Read live from the Custom Hackathon Devnet on every ledger close">
        The reserve, right now
      </SectionHeading>

      <StateNotice state={state} error={error} />
      {rpcError && (
        <p className="muted small">
          Last ledger read failed: {rpcError} — showing the most recent values that came back.
        </p>
      )}

      <div className="grid grid-3">
        <ReservePanel vault={view.vault} />
        <CushionPanel broker={view.broker} onPostCover={postCover} busy={busy} />
        <ProtectionPanel protection={protection} />
      </div>

      <div className="grid grid-2">
        <LoanCard slot="A" loan={view.loans.A} ledgerTime={ledgerTime} onRepay={repay} busy={busy} />
        <LoanCard slot="B" loan={view.loans.B} ledgerTime={ledgerTime} onRepay={repay} busy={busy} />
      </div>

      <WalletPanel
        vaultId={vaultId}
        shareMptId={shareMptId}
        issuanceId={issuanceId}
        onDeposit={deposit}
        onWithdrawAll={withdrawAll}
        busy={busy}
      />

      {txError && (
        <div className="panel panel-error">
          <strong>Last action</strong>
          <p>{txError}</p>
          <button type="button" className="btn btn-ghost" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}

      <SubmittedPanel log={log} />

      <EventFeed />
    </div>
  )
}
