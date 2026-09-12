import { useDashboard, type BrokerView, type LoanView, type VaultView } from './useDashboard'
import { NETWORK } from '../wallet/config'

function eur(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function ReservePanel({ vault }: { vault: VaultView | null }) {
  return (
    <div className="panel">
      <p className="status status-on">
        <span className="dot" /> Reserve
      </p>
      {!vault ? (
        <p className="muted">Not created yet — run `npm run demo setup`.</p>
      ) : (
        <dl className="fields">
          <dt>Share price</dt>
          <dd style={{ fontSize: 20, fontWeight: 700 }}>€{eur(vault.sharePrice)}</dd>
          <dt>Assets total</dt>
          <dd>€{eur(vault.assetsTotal)}</dd>
          <dt>Available</dt>
          <dd>€{eur(vault.assetsAvailable)}</dd>
          <dt>Unrealized loss</dt>
          <dd style={vault.lossUnrealized > 0 ? { color: 'var(--err)' } : undefined}>
            €{eur(vault.lossUnrealized)}
          </dd>
          <dt>Shares out</dt>
          <dd>{eur(vault.outstandingShares)}</dd>
        </dl>
      )}
    </div>
  )
}

function CushionPanel({ broker }: { broker: BrokerView | null }) {
  if (!broker) {
    return (
      <div className="panel">
        <p className="status status-off">
          <span className="dot" /> Manager cushion
        </p>
        <p className="muted">Not created yet.</p>
      </div>
    )
  }

  const debtTotal = Number(broker.debtTotal)
  const coverAvailable = Number(broker.coverAvailable)
  const minCover = (debtTotal * broker.coverRateMinimum) / 100000
  const short = coverAvailable < minCover

  return (
    <div className="panel">
      <p className={`status ${short ? 'status-off' : 'status-on'}`}>
        <span className="dot" /> Manager cushion
      </p>
      <dl className="fields">
        <dt>Cover available</dt>
        <dd style={short ? { color: 'var(--warn)' } : undefined}>€{eur(coverAvailable)}</dd>
        <dt>Debt total</dt>
        <dd>€{eur(debtTotal)}</dd>
        <dt>Min required</dt>
        <dd>€{eur(minCover)} ({(broker.coverRateMinimum / 1000).toFixed(1)}%)</dd>
      </dl>
    </div>
  )
}

const STATUS_LABEL: Record<LoanView['status'], string> = {
  active: 'Active',
  impaired: 'Impaired',
  defaulted: 'Defaulted',
}

function LoanCard({ slot, loan }: { slot: 'A' | 'B'; loan: LoanView | null }) {
  if (!loan) {
    return (
      <div className="panel">
        <p className="status status-off">
          <span className="dot" /> Loan {slot}
        </p>
        <p className="muted">Not originated yet.</p>
      </div>
    )
  }

  const dueDate = loan.nextPaymentDueDate ? new Date((loan.nextPaymentDueDate + 946684800) * 1000) : null

  return (
    <div className="panel">
      <p className={`status ${loan.status === 'active' ? 'status-on' : 'status-off'}`}>
        <span className="dot" /> Loan {slot} &mdash;{' '}
        <span style={loan.status === 'defaulted' ? { color: 'var(--err)' } : loan.status === 'impaired' ? { color: 'var(--warn)' } : undefined}>
          {STATUS_LABEL[loan.status]}
        </span>
      </p>
      <dl className="fields">
        <dt>Outstanding</dt>
        <dd>€{eur(Number(loan.principalOutstanding))}</dd>
        <dt>Total due</dt>
        <dd>€{eur(Number(loan.totalValueOutstanding))}</dd>
        <dt>Payments left</dt>
        <dd>{loan.paymentRemaining}</dd>
        {dueDate && (
          <>
            <dt>Next due</dt>
            <dd>{dueDate.toLocaleTimeString()}</dd>
          </>
        )}
      </dl>
    </div>
  )
}

function InsurancePanel({ insurance }: { insurance: { released: boolean; cancelled: boolean } | null }) {
  const label = !insurance
    ? 'Not sold yet'
    : insurance.released
      ? 'Paid out to the investor'
      : insurance.cancelled
        ? 'Expired — returned to the insurer'
        : 'Locked, awaiting outcome'

  return (
    <div className="panel">
      <p className={`status ${insurance?.released ? 'status-on' : 'status-off'}`}>
        <span className="dot" /> Credit insurance
      </p>
      <p className="muted">{label}</p>
    </div>
  )
}

function EventFeed({ events, ledgerIndex }: { events: string[]; ledgerIndex: number | null }) {
  return (
    <div className="panel">
      <p className="status status-on">
        <span className="dot" /> Live feed {ledgerIndex ? <span className="muted">(ledger {ledgerIndex})</span> : null}
      </p>
      {events.length === 0 ? (
        <p className="muted">Waiting for the first ledger close...</p>
      ) : (
        <ul className="steps">
          {events.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Dashboard() {
  const view = useDashboard()

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="header" style={{ border: 'none', padding: 0 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>TrustFlow reserve — live</h2>
        <span className={`chip ${view.connected ? '' : 'muted'}`}>
          {view.connected ? `Connected — ${NETWORK.name}` : 'Connecting...'}
        </span>
      </div>

      {!view.hasState && (
        <div className="panel panel-notice">
          <strong>No demo state yet</strong>
          <p>
            Run <code>npm run demo setup</code> (and later <code>prestage</code>, then <code>s1</code>...
            <code>s10</code>) to populate this dashboard.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <ReservePanel vault={view.vault} />
        <CushionPanel broker={view.broker} />
        <InsurancePanel insurance={view.insurance} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <LoanCard slot="A" loan={view.loans.A} />
        <LoanCard slot="B" loan={view.loans.B} />
      </div>

      <EventFeed events={view.events} ledgerIndex={view.ledgerIndex} />
    </section>
  )
}
