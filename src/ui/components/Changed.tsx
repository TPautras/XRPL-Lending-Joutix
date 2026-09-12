import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from 'cn'

/**
 * A brief wash behind a value that just changed.
 *
 * The whole visual payload of the demo is a number moving while the audience watches — the
 * cushion draining and `LossUnrealized` rising when the manager records a default. Without
 * this the numbers simply swap between two ledger closes and nothing draws the eye to the
 * one that matters.
 *
 * Deliberately restrained: a 1.2s fade on a tinted background, no movement, no scale. It
 * also respects `prefers-reduced-motion` by being a colour transition rather than motion,
 * so there is nothing to disable.
 */
export function Changed({
  value,
  tone = 'accent',
  children,
  className,
}: {
  /** Changing this is what triggers the wash — pass the formatted value, not the object. */
  value: string | number | null | undefined
  tone?: 'accent' | 'ok' | 'warn' | 'err'
  children: ReactNode
  className?: string
}) {
  const previous = useRef(value)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    // The first render is not a change — only a value that moved after the page settled.
    if (previous.current === value) return
    const hadPrevious = previous.current !== undefined && previous.current !== null
    previous.current = value
    if (!hadPrevious) return

    setFlash(true)
    const timer = setTimeout(() => setFlash(false), 1200)
    return () => clearTimeout(timer)
  }, [value])

  const wash = {
    accent: 'var(--accent-soft)',
    ok: 'var(--ok-soft)',
    warn: 'var(--warn-soft)',
    err: 'var(--err-soft)',
  }[tone]

  return (
    <span
      className={cn('-mx-1.5 rounded-md px-1.5 transition-colors duration-[1200ms]', className)}
      style={{ backgroundColor: flash ? wash : 'transparent' }}
    >
      {children}
    </span>
  )
}
