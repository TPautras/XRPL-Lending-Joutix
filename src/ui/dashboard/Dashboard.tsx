import { NeedsDemo, Panel, SectionHeading } from '../components/Panel'
import { AddressLink } from '../components/TxLink'
import { useAppState, type AppState } from '../lib/appState'
import { useLedger } from '../lib/ledger'
import { useProtection, type ProtectionView } from '../lib/protection'
import {
  clockTime,
  countdown,
  coverRatePercent,
  eur,
  fillPercent,
  isoToClock,
  lessThanBase,
  minimumCover,
  sharePrice,
  subtractBase,
  units,
} from '../lib/format'
import { hrefFor } from '../lib/router'
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

function CushionPanel({ broker }: { broker: BrokerView | null }) {
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
    </Panel>
  )
}

const LOAN_TONE = { active: 'on', impaired: 'warn', defaulted: 'err' } as const
const LOAN_LABEL = { active: 'Active', impaired: 'Impaired', defaulted: 'Defaulted' } as const

function LoanCard({ slot, loan, ledgerTime }: { slot: 'A' | 'B'; loan: LoanView | null; ledgerTime: number | null }) {
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

  const view: DashboardData = data ?? { vault: null, broker: null, loans: { A: null, B: null } }

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
        <CushionPanel broker={view.broker} />
        <ProtectionPanel protection={protection} />
      </div>

      <div className="grid grid-2">
        <LoanCard slot="A" loan={view.loans.A} ledgerTime={ledgerTime} />
        <LoanCard slot="B" loan={view.loans.B} ledgerTime={ledgerTime} />
      </div>

      <EventFeed />
    </div>
  )
}
