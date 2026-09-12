import { cn } from 'cn'
import { hrefFor, NAV, type Route } from '../lib/router'
import { StatusDot, type Tone } from './Panel'
import { useLedger } from '../lib/ledger'
import { NETWORK } from '../lib/network'

const STATUS_LABEL = {
  online: 'live',
  connecting: 'connecting…',
  offline: 'offline',
} as const

const STATUS_TONE: Record<keyof typeof STATUS_LABEL, Tone> = {
  online: 'on',
  connecting: 'warn',
  offline: 'err',
}

const STATUS_TEXT = {
  online: 'text-ok border-ok/30',
  connecting: 'text-warn border-warn/30',
  offline: 'text-err border-err/30',
} as const

export function Nav({ route }: { route: Route }) {
  const { status, ledgerIndex } = useLedger()

  return (
    <nav className="border-border flex flex-wrap items-center justify-between gap-3 border-b pb-3">
      <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
        {NAV.map((item) => (
          <li key={item.route}>
            <a
              className={cn(
                'block rounded-full border border-transparent px-3.5 py-2 text-sm no-underline transition-colors',
                route === item.route
                  ? 'bg-accent-soft text-foreground border-primary/35'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
              href={hrefFor(item.route)}
              aria-current={route === item.route ? 'page' : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
      <span
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap',
          STATUS_TEXT[status],
        )}
        title={NETWORK.wss}
      >
        <StatusDot tone={STATUS_TONE[status]} className="size-[7px]" />
        {STATUS_LABEL[status]}
        {ledgerIndex !== null && <span className="text-muted-foreground">· ledger {ledgerIndex}</span>}
      </span>
    </nav>
  )
}
