import type { ReactNode } from 'react'

export function Panel({
  title,
  tone = 'on',
  aside,
  children,
}: {
  title: ReactNode
  /** `on` = live/healthy, `off` = nothing there yet, `warn`/`err` = attention. */
  tone?: 'on' | 'off' | 'warn' | 'err'
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <p className={`status status-${tone}`}>
          <span className="dot" />
          {title}
        </p>
        {aside}
      </div>
      {children}
    </div>
  )
}

/** Says which command produces the missing data, rather than just "no data". */
export function NeedsDemo({ command, what }: { command: string; what: string }) {
  return (
    <p className="muted">
      {what} — run <code>{command}</code>.
    </p>
  )
}

export function SectionHeading({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="section-heading">
      <h2>{children}</h2>
      {sub && <p className="muted">{sub}</p>}
    </div>
  )
}
