import { deliberateNote } from '../lib/evidence'
import { accountUrl, shortAddress, shortHash, txUrl } from '../lib/format'

export function TxLink({ hash, length = 10 }: { hash: string; length?: number }) {
  if (!hash) return <span className="muted">—</span>
  return (
    <a className="mono-link" href={txUrl(hash)} target="_blank" rel="noreferrer" title={hash}>
      {shortHash(hash, length, 6)}
    </a>
  )
}

export function AddressLink({ address, full = false }: { address: string; full?: boolean }) {
  if (!address) return <span className="muted">—</span>
  return (
    <a className="mono-link" href={accountUrl(address)} target="_blank" rel="noreferrer" title={address}>
      {full ? address : shortAddress(address)}
    </a>
  )
}

export type ResultKind = 'success' | 'expected' | 'failure' | 'skipped'

/**
 * `type` is the transaction the code came back on. Without it a code can only be judged
 * on its own, and `tecINSUFFICIENT_FUNDS` on a `LoanSet` would be dressed up as `s7`'s
 * deliberate over-withdraw — see DELIBERATE_CASES.
 */
export function resultKind(result: string, type?: string): ResultKind {
  if (result === 'tesSUCCESS') return 'success'
  if (!result || result === 'not attempted') return 'skipped'
  if (deliberateNote(type, result)) return 'expected'
  return 'failure'
}

/**
 * The raw engine code is always the label — CLAUDE.md: for these newer transaction types
 * the code is the fastest debugging signal, so it is never paraphrased away. The colour
 * only says whether the code was the point (s7, s8) or a genuine surprise.
 */
export function ResultPill({ result, type }: { result: string; type?: string }) {
  const kind = resultKind(result, type)
  const why = deliberateNote(type, result)
  return (
    <span className={`pill pill-${kind}`} title={why ? `Deliberate: ${why}` : undefined}>
      <code>{result || 'not attempted'}</code>
      {kind === 'expected' && <span className="pill-tag">deliberate</span>}
    </span>
  )
}
