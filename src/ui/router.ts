import { useSyncExternalStore } from 'react'

/**
 * Six static screens that never deep-link into anything and have to survive being
 * opened from a stale `vite preview` (or `file://`) if the dev server dies mid-pitch.
 * That is the whole requirement, so this is a `hashchange` listener rather than
 * `react-router-dom` — see CLAUDE.md, "Routing and known gaps".
 *
 * `BUILT` is the nav's source of truth: a route only appears once its page exists.
 * A half-finished page is worse on stage than an absent one, and a nav link to a
 * blank screen is worse than both.
 */
export const ROUTES = {
  '/': 'Home',
  '/dashboard': 'Dashboard',
  '/gate': 'The Gate',
  '/insurance': 'Protection',
  '/explorer': 'Explorer',
  '/findings': 'Findings',
} as const

export type Route = keyof typeof ROUTES

export const BUILT: readonly Route[] = ['/', '/dashboard', '/gate']

/** Anything unknown — a typo, a stale link, a hash from a previous build — lands on Home. */
export function normalize(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '') || '/'
  return (BUILT as readonly string[]).includes(path) ? (path as Route) : '/'
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useRoute(): Route {
  return normalize(
    useSyncExternalStore(
      subscribe,
      () => window.location.hash,
      () => '',
    ),
  )
}

/** `#/dashboard` — the href form, so links stay plain anchors and keep middle-click. */
export function href(route: Route): string {
  return `#${route}`
}
