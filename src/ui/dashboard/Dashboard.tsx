import { useEffect, useRef, useState } from 'react'
import {
  useDashboard,
  type BrokerView,
  type FeedEvent,
  type InsuranceView,
  type LoanView,
  type VaultView,
} from './useDashboard'
import { NETWORK } from '../wallet/config'
import { countdown, rate, rippleNow, sharePrice, shortId, tfeur, units } from '../lib/format'

/** A second-resolution clock, so the "defaultable in 38s" countdowns actually move
 * while the audience watches. Cheap: one setState per second, no network. */
function useNow(): number {
  const [now, setNow] = useState(() => rippleNow())
  useEffect(() => {
    const t = setInterval(() => setNow(rippleNow()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** Highlights a figure for a moment when it changes — the cushion draining and
 * LossUnrealized moving during s9 is the visual payload of the whole demo, and a
 * number that silently differs from the one you glanced at is easy to miss on stage. */
function useFlash(value: string | number): string {
  const previous = useRef(value)
  const [lit, setLit] = useState(false)

  useEffect(() => {
    if (previous.current === value) return
    previous.current = value
    setLit(true)
    const t = setTimeout(() => setLit(false), 1400)
    return () => clearTimeout(t)
  }, [value])

  return lit ? ' flash' : ''
}

function Value({ children, big, tone }: { children: string; big?: boolean; tone?: 'ok' | 'warn' | 'err' }) {
  const flash = useFlash(children)
  const toneClass = tone ? ` value-${tone}` : ''
  return <span className={`value${big ? ' value-big' : ''}${toneClass}${flash}`}>{children}</span>
}

function ReservePanel({ vault }: { vault: VaultView | null }) {
  if (!vault) {
    return (
      <div className="panel">
        <p className="status status-off">
          <span className="dot" /> Reserve
        </p>
        <p className="muted">
          Not created yet — run <code>npm run demo setup</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="panel panel-hero">
      <p className="status status-on">
        <span className="dot" /> Reserve
        {vault.private && <span className="chip chip-inline">private</span>}
      </p>

      <p className="hero-metric">
        <Value big>{sharePrice(vault.sharePrice)}</Value>
        <span className="muted hero-metric-label">TFEUR per share</span>
      </p>

      <dl className="fields fields-wide">
        <dt>Assets total</dt>
        <dd>
          <Value>{tfeur(vault.assetsTotal)}</Value>
        </dd>
        <dt>Available</dt>
        <dd>
          <Value>{tfeur(vault.assetsAvailable)}</Value>
          <span className="muted">withdrawable now</span>
        </dd>
        <dt>Deployed</dt>
        <dd>
          <Value>{tfeur(vault.assetsDeployed)}</Value>
          <span className="muted">out on loan</span>
        </dd>
        <dt>Unrealized loss</dt>
        <dd>
          <Value tone={vault.lossUnrealized > 0 ? 'err' : undefined}>{tfeur(vault.lossUnrealized)}</Value>
        </dd>
        <dt>Shares out</dt>
        <dd>
          <Value>{units(vault.outstandingShares)}</Value>
        </dd>
      </dl>
    </div>
  )
}

function CushionPanel({ broker, loanCount }: { broker: BrokerView | null; loanCount: number }) {
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

  // The bar is scaled so the minimum-cover threshold always sits somewhere visible:
  // whichever of the two is larger sets the top, with headroom above it.
  const span = Math.max(broker.coverAvailable, broker.coverRequired, 1) * 1.2
  const fill = Math.min(100, (broker.coverAvailable / span) * 100)
  const mark = Math.min(100, (broker.coverRequired / span) * 100)

  return (
    <div className="panel">
      <p className={`status ${broker.short ? 'status-warn' : 'status-on'}`}>
        <span className="dot" /> Manager cushion
      </p>

      <p className="hero-metric">
        <Value big tone={broker.short ? 'warn' : undefined}>{tfeur(broker.coverAvailable)}</Value>
        <span className="muted hero-metric-label">first-loss cover</span>
      </p>

      <div className="cover-bar" title={`Minimum ${rate(broker.coverRateMinimum)} of debt`}>
        <span className={`cover-fill${broker.short ? ' cover-fill-short' : ''}`} style={{ width: `${fill}%` }} />
        <span className="cover-mark" style={{ left: `${mark}%` }} />
      </div>
      <p className="cover-legend muted">
        minimum {tfeur(broker.coverRequired)} ({rate(broker.coverRateMinimum)} of debt)
      </p>

      <dl className="fields fields-wide">
        <dt>Debt total</dt>
        <dd>
          <Value>{tfeur(broker.debtTotal)}</Value>
          {loanCount > 0 && <span className="muted">across {loanCount} loans</span>}
        </dd>
        <dt>Headroom</dt>
        <dd>
          <Value tone={broker.short ? 'err' : 'ok'}>
            {`${broker.short ? '−' : '+'}${tfeur(Math.abs(broker.coverAvailable - broker.coverRequired))}`}
          </Value>
        </dd>
      </dl>
      <p className="muted panel-note">
        XLS-66 refuses to originate while cover is below this line — the manager is exposed before
        the reserve is.
      </p>
    </div>
  )
}

const LOAN_LABEL: Record<LoanView['status'], string> = {
  active: 'Active',
  impaired: 'Impaired',
  defaulted: 'Defaulted',
  repaid: 'Repaid in full',
}

function LoanCard({ slot, loan, now }: { slot: 'A' | 'B'; loan: LoanView | null; now: number }) {
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

  const statusClass =
    loan.status === 'defaulted'
      ? 'status-err'
      : loan.status === 'impaired' || loan.overdue
        ? 'status-warn'
        : loan.status === 'repaid'
          ? 'status-on'
          : 'status-on'

  const tone = loan.status === 'defaulted' ? 'err' : loan.status === 'impaired' ? 'warn' : undefined

  return (
    <div className="panel">
      <p className={`status ${statusClass}`}>
        <span className="dot" /> Loan {slot}
        <span className="status-sep">·</span>
        <Value tone={tone}>{LOAN_LABEL[loan.status]}</Value>
        {loan.overdue && <span className="chip chip-inline chip-warn">payment overdue</span>}
      </p>

      {loan.status === 'repaid' ? (
        // The ledger clears the outstanding fields on full repayment, so there is
        // nothing left to print — say that rather than rendering a row of zeros.
        <p className="muted">
          Principal and interest settled; the <code>Loan</code> object remains with its payment
          history. Nothing outstanding.
        </p>
      ) : (
        <dl className="fields fields-wide">
          <dt>Outstanding</dt>
          <dd>
            <Value tone={tone}>{tfeur(loan.principalOutstanding)}</Value>
          </dd>
          <dt>Total due</dt>
          <dd>
            <Value>{tfeur(loan.totalValueOutstanding)}</Value>
          </dd>
          <dt>Installment</dt>
          <dd>
            {tfeur(loan.periodicPayment)} × {loan.paymentRemaining} left
          </dd>
          {loan.nextPaymentDueDate > 0 && (
            <>
              <dt>Next due</dt>
              <dd>
                <Value tone={loan.overdue ? 'warn' : undefined}>
                  {countdown(loan.nextPaymentDueDate - now)}
                </Value>
              </dd>
            </>
          )}
          {loan.defaultableAt !== null && loan.status !== 'defaulted' && (
            <>
              <dt>Defaultable</dt>
              <dd>
                <Value tone={now > loan.defaultableAt ? 'err' : undefined}>
                  {now > loan.defaultableAt ? 'now' : countdown(loan.defaultableAt - now)}
                </Value>
                <span className="muted">grace period</span>
              </dd>
            </>
          )}
        </dl>
      )}

      <p className="muted panel-note">
        <code>{shortId(loan.loanId)}</code>
      </p>
    </div>
  )
}

const INSURANCE_LABEL: Record<InsuranceView['status'], string> = {
  locked: 'Locked on-ledger',
  released: 'Paid out to the buyer',
  expired: 'Expired — reclaimed by the insurer',
  gone: 'No longer on the ledger',
}

function InsurancePanel({ insurance, now }: { insurance: InsuranceView | null; now: number }) {
  if (!insurance) {
    return (
      <div className="panel">
        <p className="status status-off">
          <span className="dot" /> Credit insurance
        </p>
        <p className="muted">
          Not sold yet — run <code>npm run demo prestage</code>.
        </p>
      </div>
    )
  }

  const statusClass =
    insurance.status === 'released' ? 'status-on' : insurance.status === 'locked' ? 'status-warn' : 'status-off'

  return (
    <div className="panel">
      <p className={`status ${statusClass}`}>
        <span className="dot" /> Credit insurance
        <span className="status-sep">·</span>
        <Value tone={insurance.status === 'released' ? 'ok' : undefined}>
          {INSURANCE_LABEL[insurance.status]}
        </Value>
      </p>

      <p className="hero-metric">
        <Value big>{tfeur(insurance.amount)}</Value>
        <span className="muted hero-metric-label">covered</span>
      </p>

      <dl className="fields fields-wide">
        <dt>Buyer</dt>
        <dd>
          <code>{shortId(insurance.destination)}</code>
        </dd>
        <dt>Insurer</dt>
        <dd>
          <code>{shortId(insurance.owner)}</code>
        </dd>
        {insurance.status === 'locked' && (
          <>
            <dt>Expires</dt>
            <dd>{countdown(insurance.cancelAfter - now)}</dd>
          </>
        )}
      </dl>

      <p className="muted panel-note">
        The escrow cannot read the loan&rsquo;s default flag — no lock on XRPL can. The manager,
        acting as a named referee, holds the fulfillment and submits <code>EscrowFinish</code> after
        recording the default. That trusted step is the finding, not a detail.
      </p>
    </div>
  )
}

/**
 * The loans the broker owns that state.json does not track: earlier runs, the gate
 * probes, anything a teammate originated. They are inside DebtTotal whether or not they
 * are on screen, and omitting them makes the reserve's figures impossible to reconcile
 * against the cards above — which reads as invented numbers rather than a partial view.
 */
function OtherLoans({ loans, debtTotal, outstanding }: { loans: LoanView[]; debtTotal: number; outstanding: number }) {
  if (loans.length === 0) return null

  // Floating-point noise aside, these should agree; say so either way rather than
  // leaving the audience to add it up.
  const reconciles = Math.abs(outstanding - debtTotal) < 1

  return (
    <div className="panel">
      <p className="status status-warn">
        <span className="dot" /> {loans.length} more loan{loans.length > 1 ? 's' : ''} on this broker
      </p>
      <p className="muted matrix-sub">
        Not tracked in <code>state.json</code> — left over from earlier runs and the gate probes —
        but counted in <code>DebtTotal</code>, so they belong on screen.
      </p>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Loan</th>
              <th>Borrower</th>
              <th>Status</th>
              <th className="num">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l) => (
              <tr key={l.loanId}>
                <td>
                  <code>{shortId(l.loanId)}</code>
                </td>
                <td>
                  <code>{shortId(l.borrower)}</code>
                </td>
                <td>{LOAN_LABEL[l.status]}</td>
                <td className="num">{tfeur(l.principalOutstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted panel-note">
        Outstanding across every loan on this broker: <strong>{tfeur(outstanding)}</strong>{' '}
        {reconciles ? '— matches' : '— does not match'} the broker&rsquo;s{' '}
        <code>DebtTotal</code> of {tfeur(debtTotal)}.
      </p>
    </div>
  )
}

function EventFeed({ events }: { events: FeedEvent[] }) {
  return (
    <div className="panel">
      <p className="status status-on">
        <span className="dot" /> Ledger events
      </p>
      {events.length === 0 ? (
        <p className="muted">
          Watching. Nothing has changed since this page loaded — every line below is a real
          difference between two reads of the ledger, not a heartbeat.
        </p>
      ) : (
        <ul className="feed">
          {events.map((e, i) => (
            <li key={`${e.ts}-${i}`} className={`feed-${e.kind}`}>
              <span className="feed-ts">{e.ts}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Dashboard() {
  const view = useDashboard()
  const now = useNow()

  return (
    <section className="dash">
      <div className="dash-head">
        <h2>TrustFlow reserve — live</h2>
        <div className="dash-head-right">
          {view.ledgerIndex && <span className="chip">ledger {view.ledgerIndex}</span>}
          {view.lastUpdate && <span className="chip">read {view.lastUpdate}</span>}
          <span className={`chip ${view.connected ? 'chip-ok' : 'chip-warn'}`}>
            {view.connected ? NETWORK.name : 'connecting…'}
          </span>
        </div>
      </div>

      {!view.hasState && (
        <div className="panel panel-notice">
          <strong>No demo state yet</strong>
          <p>
            Run <code>npm run demo setup</code> (then <code>prestage</code>, then <code>s1</code>…
            <code>s10</code>) to populate this dashboard. Everything here is read from the ledger;
            nothing on this page can submit a transaction.
          </p>
        </div>
      )}

      <div className="dash-grid">
        <ReservePanel vault={view.vault} />
        <CushionPanel
          broker={view.broker}
          loanCount={(view.loans.A ? 1 : 0) + (view.loans.B ? 1 : 0) + view.otherLoans.length}
        />
      </div>

      <div className="dash-grid">
        <LoanCard slot="A" loan={view.loans.A} now={now} />
        <LoanCard slot="B" loan={view.loans.B} now={now} />
      </div>

      <OtherLoans
        loans={view.otherLoans}
        debtTotal={view.broker?.debtTotal ?? 0}
        outstanding={view.loansOutstanding}
      />

      <InsurancePanel insurance={view.insurance} now={now} />

      <EventFeed events={view.events} />

      <p className="muted dash-foot">
        <strong>TFEUR is not euros.</strong> It is a Multi-Purpose Token (XLS-33) minted for this
        demo by our own issuer account on the devnet — ticker <code>TFEUR</code>, name{' '}
        <code>TrustFlow demo EUR</code>, <code>AssetScale 2</code> — with no reserve, no redemption
        and no issuer obligation behind it. It stands in for a euro stablecoin because an invoice is
        denominated in something; on mainnet that role would be played by an actual issued
        stablecoin. The ledger stores these amounts as integer base units and they are divided by
        100 here, at the render edge only. Share price is
        <code> AssetsTotal ÷ OutstandingAmount</code>, a ratio — it carries no scale of its own.
      </p>
    </section>
  )
}
