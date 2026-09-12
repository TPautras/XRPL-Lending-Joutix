import type { ReactNode } from 'react'
import { cn } from 'cn'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export type Tone = 'on' | 'off' | 'warn' | 'err'

const DOT: Record<Tone, string> = {
  on: 'bg-ok shadow-[0_0_0_4px_var(--ok-soft)]',
  off: 'bg-muted-foreground',
  warn: 'bg-warn shadow-[0_0_0_4px_var(--warn-soft)]',
  err: 'bg-err shadow-[0_0_0_4px_var(--err-soft)]',
}

const TITLE: Record<Tone, string> = {
  on: 'text-ok',
  off: 'text-muted-foreground',
  warn: 'text-warn',
  err: 'text-err',
}

/** The status light a panel title carries — also used on its own inside dense rows. */
export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', DOT[tone], className)} />
}

export function Panel({
  title,
  tone = 'on',
  aside,
  className,
  children,
}: {
  title: ReactNode
  /** `on` = live/healthy, `off` = nothing there yet, `warn`/`err` = attention. */
  tone?: Tone
  aside?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={cn('gap-0 py-5', tone === 'err' && 'border-err/40', tone === 'warn' && 'border-warn/30', className)}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3 px-5 [.border-b]:pb-0">
        <CardTitle className={cn('flex items-center gap-2.5 text-sm font-semibold', TITLE[tone])}>
          <StatusDot tone={tone} />
          {title}
        </CardTitle>
        {aside}
      </CardHeader>
      <CardContent className="px-5 pt-3.5">{children}</CardContent>
    </Card>
  )
}

/** Says which command produces the missing data, rather than just "no data". */
export function NeedsDemo({ command, what }: { command: string; what: string }) {
  return (
    <p className="text-muted-foreground text-sm">
      {what} — run <code className="text-foreground">{command}</code>.
    </p>
  )
}

export function SectionHeading({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mt-1.5">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {sub && <p className="text-muted-foreground mt-1.5 max-w-[78ch] text-sm">{sub}</p>}
    </div>
  )
}

/**
 * The small-caps section label inside a panel. Was a bare `<h3>` styled globally by the
 * pre-Tailwind stylesheet; that rule is gone, so the styling lives here instead of being
 * re-typed (or, as happened, silently lost) at each call site.
 */
export function Rubric({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-muted-foreground mt-5 mb-1 text-xs font-semibold tracking-[0.06em] uppercase">{children}</h3>
  )
}

/** A pill of context that sits in a panel's `aside` slot. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Badge variant="muted" className={cn('gap-1.5 px-2.5 py-1 text-xs font-normal', className)}>
      {children}
    </Badge>
  )
}
