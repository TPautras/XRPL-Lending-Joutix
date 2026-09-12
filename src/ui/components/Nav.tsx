import { hrefFor, NAV, type Route } from '../lib/router'
import { useLedger } from '../lib/ledger'
import { NETWORK } from '../lib/network'

const STATUS_LABEL = {
  online: 'live',
  connecting: 'connecting…',
  offline: 'offline',
} as const

export function Nav({ route }: { route: Route }) {
  const { status, ledgerIndex } = useLedger()

  return (
    <nav className="nav">
      <ul className="nav-links">
        {NAV.map((item) => (
          <li key={item.route}>
            <a
              className={`nav-link ${route === item.route ? 'nav-link-active' : ''}`}
              href={hrefFor(item.route)}
              aria-current={route === item.route ? 'page' : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
      <span className={`chip chip-status chip-${status}`} title={NETWORK.wss}>
        <span className="dot" />
        {STATUS_LABEL[status]}
        {ledgerIndex !== null && <span className="muted"> · ledger {ledgerIndex}</span>}
      </span>
    </nav>
  )
}
