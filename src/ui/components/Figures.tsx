import type { ReactNode } from 'react'
import { cn } from 'cn'

/**
 * The numbers layer. Three rules from the dataviz pass hold everything here together:
 * a view leads with exactly one hero figure; a ratio against a limit is a meter, never a
 * chart; and large standalone numbers use proportional figures — `tabular-nums` makes a
 * value like `121` look loose at display sizes and is reserved for columns that align
 * vertically (the base layer puts it on `th`/`td` and nowhere else).
 */

/** The single number a view leads with. Exactly one per screen. */
export function Hero({
  value,
  label,
  tone,
  sub,
}: {
  value: ReactNode
  label: ReactNode
  tone?: 'ok' | 'warn' | 'err'
  sub?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          'text-5xl leading-none font-semibold tracking-tight',
          tone === 'ok' && 'text-ok',
          tone === 'warn' && 'text-warn',
          tone === 'err' && 'text-err',
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground text-sm">{label}</span>
      {sub}
    </div>
  )
}

/** A secondary headline number inside a panel. */
export function Metric({
  value,
  label,
  tone,
}: {
  value: ReactNode
  label: ReactNode
  tone?: 'ok' | 'warn' | 'err'
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          'text-[26px] leading-tight font-bold tracking-tight',
          tone === 'ok' && 'text-ok',
          tone === 'warn' && 'text-warn',
          tone === 'err' && 'text-err',
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground text-[13px]">{label}</span>
    </div>
  )
}

export function StatTile({
  value,
  label,
  tone,
}: {
  value: ReactNode
  label: ReactNode
  tone?: 'ok' | 'warn' | 'err'
}) {
  return (
    <div className="bg-card border-border rounded-xl border px-4 py-3.5">
      <span
        className={cn(
          'block text-[22px] font-bold',
          tone === 'ok' && 'text-ok',
          tone === 'warn' && 'text-warn',
          tone === 'err' && 'text-err',
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  )
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">{children}</div>
}

/**
 * A ratio against a limit. The fill carries severity and the unfilled track is a lighter
 * step of the fill's own hue, so the state reads across the whole bar rather than only in
 * the filled part.
 */
export function Meter({
  percent,
  tone = 'accent',
  label,
  className,
}: {
  percent: number
  tone?: 'accent' | 'ok' | 'warn' | 'err'
  label?: string
  className?: string
}) {
  const hue = { accent: 'var(--primary)', ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--err)' }[tone]
  const clamped = Math.max(0, Math.min(100, percent))

  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full', className)}
      style={{ background: `color-mix(in oklab, ${hue} 16%, var(--background))` }}
      role="meter"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      title={label}
    >
      <span
        className="block h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${clamped}%`, background: hue }}
      />
    </div>
  )
}

/** The label/value grid every panel uses for its supporting numbers. */
export function Fields({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <dl
      className={cn(
        'tabular mt-3.5 grid items-baseline gap-x-4 gap-y-2.5',
        wide ? 'grid-cols-[minmax(140px,auto)_1fr]' : 'grid-cols-[minmax(100px,auto)_1fr]',
      )}
    >
      {children}
    </dl>
  )
}

export function Field({
  label,
  children,
  tone,
}: {
  label: ReactNode
  children: ReactNode
  tone?: 'ok' | 'warn' | 'err'
}) {
  return (
    <>
      <dt className="text-muted-foreground text-[13px]">{label}</dt>
      <dd
        className={cn(
          'm-0 flex flex-wrap items-center gap-2.5 wrap-anywhere',
          tone === 'ok' && 'text-ok',
          tone === 'warn' && 'text-warn',
          tone === 'err' && 'text-err',
        )}
      >
        {children}
      </dd>
    </>
  )
}

/** Held instead of a skeleton flash on refetch: the frame never jumps. */
export function Dimmed({ when, children }: { when: boolean; children: ReactNode }) {
  return <div className={cn('transition-opacity duration-300', when && 'opacity-55')}>{children}</div>
}
