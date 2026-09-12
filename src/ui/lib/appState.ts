import { useEffect, useState } from 'react'
import type { HackathonState } from '../../protocol/lib/state'

/**
 * `type`-only import: `protocol/lib/state.ts` touches `node:fs`, and this is erased at
 * compile time so none of that reaches the bundle. The shape stays shared with the
 * scripts that write the file, so adding a field there cannot silently drift from here.
 */
export type AppState = HackathonState

export interface AppStateView {
  /** null until the first successful fetch — `state/hackathon.json` (mirrored to
   * `public/state.json` by `saveState()`) only exists once a demo step has run. */
  state: AppState | null
  hasState: boolean
  /** Set when the file is missing or malformed, so pages can say which it is. */
  error: string | null
}

const EMPTY: AppStateView = { state: null, hasState: false, error: null }

/**
 * Polls the object-ID file the protocol scripts write. One of this app's only two data
 * sources (the other is live RPC) — CLAUDE.md: if a page needs a fact that is in neither,
 * write it into the state file from the protocol scripts rather than adding a server.
 */
export function useAppState(pollMs = 5000): AppStateView {
  const [view, setView] = useState<AppStateView>(EMPTY)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      try {
        const response = await fetch('/state.json', { cache: 'no-store' })
        if (!response.ok) throw new Error(`state.json returned ${response.status}`)
        // Vite's dev server answers an unknown path with the app shell rather than a 404, so
        // a missing state file arrives as HTML with a 200. Say that plainly instead of
        // surfacing a JSON parse error about an unexpected `<`.
        const body = await response.text()
        if (body.trimStart().startsWith('<')) {
          throw new Error('no state.json yet — the dev server returned the app shell')
        }
        const state = JSON.parse(body) as AppState
        if (!cancelled) setView({ state, hasState: true, error: null })
      } catch (err) {
        if (!cancelled) {
          setView((prev) => ({ ...prev, error: err instanceof Error ? err.message : String(err) }))
        }
      }
      if (!cancelled) timer = setTimeout(poll, pollMs)
    }

    void poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [pollMs])

  return view
}

/** `txLog` newest first. Safe on a state file written before `txLog` existed. */
export function txLogNewestFirst(state: AppState | null): AppState['txLog'] {
  if (!state?.txLog?.length) return []
  return [...state.txLog].sort((a, b) => b.ts.localeCompare(a.ts))
}
