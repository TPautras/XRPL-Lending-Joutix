import { useMemo, useState } from 'react'
import { Panel, SectionHeading } from '../components/Panel'
import { StatRow, StatTile } from '../components/Figures'
import { ResultPill, resultKind, TxLink } from '../components/TxLink'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
    <div className="flex flex-col gap-4">
      <SectionHeading
        sub={
          <>
            Appended by <code>src/protocol/lib/submit.ts</code> on every submission — successes and refusals alike — and
            resolved at <code>{new URL(NETWORK.explorer).host}</code>.
          </>
        }
      >
        Verified transactions
      </SectionHeading>

      {log.length > 0 ? (
        <>
          <StatRow>
            <StatTile value={counts.total} label="submitted" />
            <StatTile value={counts.success} label="tesSUCCESS" tone="ok" />
            <StatTile value={counts.expected} label="deliberate refusals" tone="warn" />
            <StatTile value={counts.failure} label="unexpected" tone={counts.failure ? 'err' : undefined} />
          </StatRow>

          <Panel
            title="Transaction log"
            aside={
              // One filter row, scoping everything below it — never a control per column.
              <ToggleGroup
                type="single"
                value={filter}
                onValueChange={(next) => next && setFilter(next as Filter)}
                variant="outline"
                size="sm"
                className="rounded-full"
              >
                {FILTERS.map((option) => (
                  <ToggleGroupItem key={option.id} value={option.id} className="px-3 text-xs">
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            }
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Hash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((entry, index) => (
                    <TableRow
                      key={`${entry.hash}-${entry.ts}-${index}`}
                      className={resultKind(entry.result, entry.type) === 'failure' ? 'bg-err-soft' : undefined}
                    >
                      <TableCell className="whitespace-nowrap">{isoToDateTime(entry.ts)}</TableCell>
                      <TableCell>
                        <code>{entry.type}</code>
                        {deliberateNote(entry.type, entry.result) && (
                          <span className="text-muted-foreground text-xs">
                            {' '}
                            — {deliberateNote(entry.type, entry.result)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ResultPill result={entry.result} type={entry.type} />
                      </TableCell>
                      <TableCell>
                        <TxLink hash={entry.hash} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        Nothing matches this filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </>
      ) : (
        <Panel title={`Recorded run · ${RECORDED_RUN_DATE}`} tone="warn">
          <p className="text-muted-foreground text-sm">
            No live log yet — <code>public/state.json</code> has no <code>txLog</code> entries, so these are the verified
            hashes from <code>README.md</code>. Run any demo step and this page switches to the live log.
            {error && <> Last fetch: {error}.</>}
          </p>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phase</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {RECORDED_TXS.map((entry) => (
                  <TableRow key={entry.hash}>
                    <TableCell className="whitespace-nowrap">{entry.phase}</TableCell>
                    <TableCell>
                      <code>{entry.step}</code>
                    </TableCell>
                    <TableCell>
                      {entry.type}
                      {entry.deliberate && <span className="text-muted-foreground text-xs"> — {entry.deliberate}</span>}
                    </TableCell>
                    <TableCell>
                      <ResultPill result={entry.result} type={entry.type} />
                    </TableCell>
                    <TableCell>
                      <TxLink hash={entry.hash} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      )}
    </div>
  )
}
