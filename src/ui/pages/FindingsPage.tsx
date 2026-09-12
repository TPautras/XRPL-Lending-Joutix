import { Panel, SectionHeading } from '../components/Panel'
import { TxLink } from '../components/TxLink'
import { FINDINGS, type Finding } from '../lib/evidence'
import { hrefFor } from '../lib/router'

const SEVERITY_TONE = { high: 'err', medium: 'warn', low: 'off' } as const

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <Panel
      title={finding.title}
      tone={SEVERITY_TONE[finding.severity]}
      aside={
        <span className="chip">
          {finding.category} · severity {finding.severity}
        </span>
      }
    >
      <p className="lede-sm">{finding.claim}</p>
      {finding.detail.map((paragraph) => (
        <p key={paragraph.slice(0, 24)}>{paragraph}</p>
      ))}

      <h3>Repro</h3>
      <p>
        <code>{finding.repro}</code>
      </p>

      <h3>On-ledger evidence</h3>
      <ul className="hash-list">
        {finding.hashes.map((entry) => (
          <li key={entry.hash}>
            {entry.label} — <TxLink hash={entry.hash} />
          </li>
        ))}
      </ul>

      <h3>Proposed fix</h3>
      <p>{finding.fix}</p>

      <p className="muted small">{finding.refs.join(' · ')}</p>
    </Panel>
  )
}

/**
 * The 40%-weighted feedback, made legible. This page *renders* the findings; the source of
 * truth stays `FEEDBACK_REPORT.md` and `docs/FRICTION.md` (both at the repo root) — restating
 * them in different words here is how the two drift apart by Sunday morning.
 */
export function FindingsPage() {
  return (
    <div className="page">
      <SectionHeading
        sub={
          <>
            Three findings, each reproducible with one command and backed by real transactions on
            the Custom Hackathon Devnet. Written up in full in <code>FEEDBACK_REPORT.md</code>, with
            the raw timestamped log in <code>docs/FRICTION.md</code>.
          </>
        }
      >
        What we found
      </SectionHeading>

      {FINDINGS.map((finding) => (
        <FindingCard key={finding.id} finding={finding} />
      ))}

      <Panel title="Also logged, with less weight" tone="off">
        <ul className="steps">
          <li>
            <strong>No separate drawdown step.</strong> <code>LoanSet</code> pays the borrower in the
            same transaction; the hackathon brief’s own minimum-bar wording still implies a separate
            drawdown. A documentation fix, and the simplest bonus contribution available.
            (<code>FEEDBACK_REPORT.md §3</code>)
          </li>
          <li>
            <strong>No <code>LoanTransfer</code>.</strong> A <code>Loan</code> is permanently tied to
            the Broker + Borrower pair that dual-signed it, so any secondary market is an
            off-protocol overlay. (<code>§4</code>)
          </li>
          <li>
            <strong>The two-party <code>LoanSet</code> fee, corrected.</strong> You do not have to
            compute the ≥2× base fee yourself — xrpl.js 5.2.0’s <code>autofill()</code> already does
            (<code>Fee: 24</code> vs <code>12</code> measured here) and says so on stdout. The gap is
            that §3.8.4 mentions no client-side support, so it is discoverable only by watching
            console output. <code>Fee</code> must still be final before the first signature.
            (<code>§5</code>)
          </li>
          <li>
            <strong>The faucet does not match the xrpl.js contract.</strong>{' '}
            <code>Client.fundWallet()</code> reads <code>body.account.classicAddress</code>; this
            event’s faucet only ever returns <code>body.account.address</code>, so the official
            helper always throws <code>XRPLFaucetError: The faucet account is undefined</code> even
            on a successful funding. (<code>§6</code>)
          </li>
          <li>
            <strong><code>tecKILLED</code> on the last installment.</strong>{' '}
            <code>tfLoanFullPayment</code> is rejected whenever{' '}
            <code>Loan.PaymentRemaining == 1</code> (XLS-66 §3.11.2), and the code — shared with{' '}
            <code>OfferCreate</code>’s fill-or-kill — points nowhere near{' '}
            <code>PaymentRemaining</code>. (<code>§8</code>)
          </li>
          <li>
            <strong><code>five-bells-condition</code> silently drops constructor options.</strong>{' '}
            <code>new PreimageSha256({'{'} preimage {'}'})</code> type-checks and does nothing; the
            preimage must be set with <code>setPreimage()</code> or{' '}
            <code>getConditionBinary()</code> throws <code>MissingDataError</code> later, decoupled
            from the mistake. (<code>docs/FRICTION.md</code> 18:05Z)
          </li>
        </ul>
      </Panel>

      <p className="muted small">
        Every hash above resolves on the hackathon explorer — the full log is on{' '}
        <a href={hrefFor('/explorer')}>Explorer</a>.
      </p>
    </div>
  )
}
