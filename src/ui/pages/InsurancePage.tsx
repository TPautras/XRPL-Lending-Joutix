import { NeedsDemo, Panel, SectionHeading } from '../components/Panel'
import { AddressLink, TxLink } from '../components/TxLink'
import { useAppState } from '../lib/appState'
import { useLedger } from '../lib/ledger'
import { useProtection, type ProtectionView } from '../lib/protection'
import { clockTime, countdown, eur, shortHash } from '../lib/format'
import { FINDINGS } from '../lib/evidence'

const PHASE_TONE: Record<ProtectionView['phase'], 'on' | 'off' | 'warn' | 'err'> = {
  none: 'off',
  locked: 'on',
  released: 'on',
  expired: 'off',
  'settled elsewhere': 'warn',
}

const PHASE_LABEL: Record<ProtectionView['phase'], string> = {
  none: 'No protection sold yet',
  locked: 'Locked on the ledger',
  released: 'Released to the buyer',
  expired: 'Expired — reclaimed by the insurer',
  'settled elsewhere': 'No longer on the ledger',
}

/**
 * The escrow, as it actually works. Deliberately no arrow from the Loan to the Escrow: the
 * whole finding is that no such link exists, so the diagram shows it crossed out and names
 * the human who stands in for it instead.
 */
function EscrowDiagram({ referee }: { referee: string | null }) {
  return (
    <div className="diagram-scroll">
      <svg viewBox="0 0 760 330" role="img" className="diagram" aria-labelledby="escrow-diagram-title">
        <title id="escrow-diagram-title">
          The insurer locks cover in a TokenEscrow, the buyer pays premiums, and the manager acting
          as referee reveals the crypto-condition fulfillment after observing a default off-ledger.
          The loan’s default flag has no native path to the escrow.
        </title>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>

        <g className="dg-node">
          <rect x="14" y="34" width="170" height="62" rx="10" />
          <text x="99" y="60">Insurer</text>
          <text x="99" y="80" className="dg-sub">locks the covered amount</text>
        </g>

        <g className="dg-node dg-node-accent">
          <rect x="295" y="34" width="180" height="62" rx="10" />
          <text x="385" y="60">TokenEscrow</text>
          <text x="385" y="80" className="dg-sub">Condition + CancelAfter</text>
        </g>

        <g className="dg-node">
          <rect x="576" y="34" width="170" height="62" rx="10" />
          <text x="661" y="60">Protection buyer</text>
          <text x="661" y="80" className="dg-sub">investor A</text>
        </g>

        <g className="dg-edge">
          <line x1="188" y1="65" x2="289" y2="65" markerEnd="url(#arrow)" />
          <text x="238" y="54" className="dg-label">EscrowCreate</text>
        </g>

        <g className="dg-edge">
          <line x1="479" y1="65" x2="570" y2="65" markerEnd="url(#arrow)" />
          <text x="524" y="54" className="dg-label">EscrowFinish</text>
        </g>

        <g className="dg-edge">
          <path d="M640,102 C640,150 180,150 130,102" markerEnd="url(#arrow)" fill="none" />
          <text x="385" y="145" className="dg-label">Payment · premium, while the loan performs</text>
        </g>

        <g className="dg-node dg-node-err">
          <rect x="14" y="240" width="170" height="62" rx="10" />
          <text x="99" y="266">Loan B</text>
          <text x="99" y="286" className="dg-sub">lsfLoanDefault set</text>
        </g>

        <g className="dg-edge dg-edge-broken">
          <path d="M184,262 C260,262 330,180 360,104" fill="none" strokeDasharray="7 6" />
          <text x="300" y="220" className="dg-label dg-label-err">no native link</text>
          <g className="dg-cross">
            <line x1="285" y1="185" x2="309" y2="209" />
            <line x1="309" y1="185" x2="285" y2="209" />
          </g>
        </g>

        <g className="dg-node">
          <rect x="430" y="240" width="200" height="62" rx="10" />
          <text x="530" y="266">Manager — referee</text>
          <text x="530" y="286" className="dg-sub">holds the fulfillment</text>
        </g>

        <g className="dg-edge">
          <line x1="200" y1="278" x2="424" y2="278" markerEnd="url(#arrow)" />
          <text x="312" y="268" className="dg-label">observes the default off-ledger</text>
        </g>

        <g className="dg-edge">
          <line x1="500" y1="236" x2="430" y2="104" markerEnd="url(#arrow)" />
          <text x="540" y="180" className="dg-label">reveals</text>
          <text x="540" y="196" className="dg-label">the fulfillment</text>
        </g>
      </svg>
      <p className="muted small">
        The trusted party is named, not implied: {referee ? <AddressLink address={referee} /> : 'the manager'}{' '}
        decides when the payout happens. The dashed edge is the part of this product the protocol
        does not provide.
      </p>
    </div>
  )
}

function ProtectionState() {
  const { state } = useAppState()
  const { ledgerTime } = useLedger()
  const { data, error } = useProtection(state)
  const view = data

  if (!view || view.phase === 'none') {
    return (
      <Panel title="Protection contract" tone="off">
        <NeedsDemo what="No escrow sold yet" command="npm run demo prestage" />
        {error && <p className="muted small">Last read failed: {error}</p>}
      </Panel>
    )
  }

  return (
    <Panel
      title="Protection contract"
      tone={PHASE_TONE[view.phase]}
      aside={<span className="chip">{view.onLedger ? 'escrow object present' : 'escrow object gone'}</span>}
    >
      <p className="metric">
        <span className="metric-value">{eur(view.amount)}</span>
        <span className="metric-label">{PHASE_LABEL[view.phase]}</span>
      </p>
      <dl className="fields fields-wide">
        <dt>Insurer (Owner)</dt>
        <dd>{view.owner ? <AddressLink address={view.owner} full /> : '—'}</dd>
        <dt>Buyer (Destination)</dt>
        <dd>{view.destination ? <AddressLink address={view.destination} full /> : '—'}</dd>
        <dt>Condition</dt>
        <dd>
          <code title={view.condition ?? undefined}>{view.condition ? shortHash(view.condition, 16, 8) : '—'}</code>
        </dd>
        <dt>CancelAfter</dt>
        <dd>
          {clockTime(view.cancelAfter)}{' '}
          <span className="muted">{countdown(view.cancelAfter, ledgerTime)}</span>
        </dd>
      </dl>
      <p className="muted small">
        Two ways out and no third: the manager reveals the fulfillment (<code>EscrowFinish</code> →
        the buyer is paid), or <code>CancelAfter</code> passes and anyone can{' '}
        <code>EscrowCancel</code> it — the insurer reclaims the cover and keeps the premiums.
      </p>
      {error && <p className="muted small">Last read failed: {error}</p>}
    </Panel>
  )
}

/**
 * Pitch 3:00–3:30. The implementation is the smaller half of this page; the finding is the
 * point. Naming: credit insurance, never "CDS" — same economic object, but this is
 * Coface/Allianz Trade's century-old business.
 */
export function InsurancePage() {
  const { state } = useAppState()
  const wall = FINDINGS.find((finding) => finding.id === 'escrow-wall')!

  return (
    <div className="page">
      <SectionHeading sub="An investor buys protection against one specific borrower’s default. The insurer locks the covered amount on-ledger; the buyer pays premiums.">
        Credit insurance
      </SectionHeading>

      <Panel title="How the contract works">
        <EscrowDiagram referee={state?.accounts?.manager ?? null} />
      </Panel>

      <ProtectionState />

      <Panel title="The wall — and why it is the best finding here" tone="err">
        <p className="lede-sm">{wall.claim}</p>
        {wall.detail.map((paragraph) => (
          <p key={paragraph.slice(0, 24)}>{paragraph}</p>
        ))}
        <h3>What is missing</h3>
        <p>{wall.fix}</p>
        <h3>Evidence</h3>
        <ul className="hash-list">
          {wall.hashes.map((entry) => (
            <li key={entry.hash}>
              {entry.label} — <TxLink hash={entry.hash} />
            </li>
          ))}
        </ul>
        <p className="muted small">
          Repro: <code>{wall.repro}</code> · {wall.refs.join(' · ')}
        </p>
      </Panel>

      <Panel title="What is transferable, precisely" tone="warn">
        <p>
          The protection contract can be represented as a transferable token, which is the
          beginning of a secondary market for credit risk — but the loan underneath it is not
          transferable. XLS-66 has <strong>no <code>LoanTransfer</code></strong>: a{' '}
          <code>Loan</code> stays permanently tied to the Broker + Borrower pair that dual-signed
          it at creation.
        </p>
        <p className="muted small">
          So any loan-level secondary market — this insurance token included — is an off-protocol
          overlay wrapping the loan’s economics, not a native reassignment of the loan itself.
          <code> FEEDBACK_REPORT.md §4</code>.
        </p>
      </Panel>
    </div>
  )
}
