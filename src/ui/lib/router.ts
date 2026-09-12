import { useEffect, useState } from 'react'

/**
 * Six static screens, no deep links, no data loading per route: `hashchange` is the whole
 * router. Hash routes also survive being opened from `file://` or a stale `vite preview`
 * if the dev server dies mid-pitch, which a history-API router would not — see CLAUDE.md
 * "Routing and known gaps" for why `react-router-dom` is deliberately not here.
 */
export const ROUTES = ['/', '/dashboard', '/gate', '/insurance', '/explorer', '/findings'] as const

export type Route = (typeof ROUTES)[number]

export const NAV: Array<{ route: Route; label: string }> = [
  { route: '/', label: 'Home' },
  { route: '/dashboard', label: 'Dashboard' },
  { route: '/gate', label: 'The Gate' },
  { route: '/insurance', label: 'Protection' },
  { route: '/explorer', label: 'Explorer' },
  { route: '/findings', label: 'Findings' },
]

export function hrefFor(route: Route): string {
  return `#${route}`
}

function currentRoute(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const path = raw.split('?')[0]
  return (ROUTES as readonly string[]).includes(path) ? (path as Route) : '/'
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute)

  useEffect(() => {
    const onHashChange = () => {
      setRoute(currentRoute())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return route
}
