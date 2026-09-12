import { useMemo, useState } from 'react'
import { Panel, SectionHeading } from '../components/Panel'
import { ResultPill, resultKind, TxLink } from '../components/TxLink'
import { txLogNewestFirst, useAppState } from '../lib/appState'
import { isoToDateTime } from '../lib/format'
import { deliberateNote, RECORDED_RUN_DATE, RECORDED_TXS } from '../lib/evidence'
import { NETWORK } from '../lib/network'

type Filter = 'all' | 'refusals' | 'success'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Everything' },
  { id: 'refusals', label: 'Refusals only' },
  { id: 'success', label: 'Successes only' },
]

/**
 * Every transaction the demo produced, newest first. Failures are first-class rows: `s7`'s
 * `tecINSUFFICIENT_FUNDS` and `s8`'s `tecNO_AUTH` are the evidence, not errors, and are
 * labelled as deliberate. A code that is neither `tesSUCCESS` nor one of the deliberate
 * ones is shown as an unexpected failure — relabelling a real bug as intentional is how a
 * demo starts lying to its audience.
 */
export function ExplorerPage() {
  const { state, error } = useAppState()
  const [filter, setFilter] = useState<Filter>('all')

  const log = useMemo(() => txLogNewestFirst(state), [state])

  const counts = useMemo(() => {
    const tally = { total: log.length, success: 0, expected: 0, failure: 0 }
    for (const entry of log) {
      const kind = resultKind(entry.result, entry.type)
      if (kind === 'success') tally.success += 1
      else if (kind === 'expected') tally.expected += 1
      else tally.failure += 1
    }
    return tally
  }, [log])

  const rows = log.filter((entry) => {
    if (filter === 'all') return true
    const kind = resultKind(entry.result, entry.type)
    return filter === 'success' ? kind === 'success' : kind !== 'success'
  })

  return (
    <div className="page">
      <SectionHeading
        sub={
          <>
            Appended by <code>src/protocol/lib/submit.ts</code> on every submission — successes and
            refusals alike — and resolved at <code>{new URL(NETWORK.explorer).host}</code>.
          </>
        }
      >
        Verified transactions
      </SectionHeading>

      {log.length > 0 ? (
        <>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-value">{counts.total}</span>
              <span className="stat-label">submitted</span>
            </div>
            <div className="stat">
              <span className="stat-value value-ok">{counts.success}</span>
              <span className="stat-label">tesSUCCESS</span>
            </div>
            <div className="stat">
              <span className="stat-value value-warn">{counts.expected}</span>
              <span className="stat-label">deliberate refusals</span>
            </div>
            <div className="stat">
              <span className={`stat-value ${counts.failure ? 'value-err' : ''}`}>{counts.failure}</span>
              <span className="stat-label">unexpected</span>
            </div>
          </div>

          <Panel
            title="Transaction log"
            aside={
              <div className="segmented">
                {FILTERS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`segmented-btn ${filter === option.id ? 'segmented-btn-active' : ''}`}
                    onClick={() => setFilter(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            }
          >
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
                  {rows.map((entry) => (
                    <tr key={`${entry.hash}-${entry.ts}`} className={resultKind(entry.result, entry.type) === 'failure' ? 'row-err' : undefined}>
                      <td className="nowrap">{isoToDateTime(entry.ts)}</td>
                      <td>
                        <code>{entry.type}</code>
                        {deliberateNote(entry.type, entry.result) && (
                          <span className="muted small"> — {deliberateNote(entry.type, entry.result)}</span>
                        )}
                      </td>
                      <td>
                        <ResultPill result={entry.result} type={entry.type} />
                      </td>
                      <td>
                        <TxLink hash={entry.hash} />
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        Nothing matches this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : (
        <Panel title={`Recorded run · ${RECORDED_RUN_DATE}`} tone="warn">
          <p className="muted">
            No live log yet — <code>public/state.json</code> has no <code>txLog</code> entries, so
            these are the verified hashes from <code>README.md</code>. Run any demo step and this
            page switches to the live log.
            {error && <> Last fetch: {error}.</>}
          </p>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Phase</th>
                  <th>Step</th>
                  <th>Transaction</th>
                  <th>Result</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                {RECORDED_TXS.map((entry) => (
                  <tr key={entry.hash}>
                    <td className="nowrap">{entry.phase}</td>
                    <td>
                      <code>{entry.step}</code>
                    </td>
                    <td>
                      {entry.type}
                      {entry.deliberate && <span className="muted small"> — {entry.deliberate}</span>}
                    </td>
                    <td>
                      <ResultPill result={entry.result} type={entry.type} />
                    </td>
                    <td>
                      <TxLink hash={entry.hash} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}
