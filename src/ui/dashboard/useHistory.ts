import { useEffect, useState } from 'react'
import { baseToNumber, minimumCover, sharePrice } from '../lib/format'
import type { DashboardData } from './useDashboard'

/**
 * The reserve's recent past, accumulated in the browser.
 *
 * Nothing on the ledger stores a time series — `vault_info` answers "what is true now", and
 * there is no backend to have recorded the rest. So the dashboard builds one the only way it
 * can: it samples what it just read on each ledger close and keeps the tail. This is what
 * makes the `s9` default *visible* as a movement rather than as two numbers that swapped
 * while nobody was looking.
 *
 * Two consequences worth saying on stage rather than hiding: the history starts when the page
 * opens (it is not backfilled, because it cannot be), and it lives at module scope so
 * navigating to another screen and back does not wipe the run that was just demoed.
 */
export interface Sample {
  t: number
  clock: string
  sharePrice: number | null
  lossUnrealized: number | null
  cover: number | null
  coverRequired: number | null
}

const MAX_SAMPLES = 120

const samples: Sample[] = []
const listeners = new Set<(next: Sample[]) => void>()

function publish() {
  const snapshot = samples.slice()
  for (const listener of listeners) listener(snapshot)
}

function sameShape(a: Sample, b: Sample): boolean {
  return (
    a.sharePrice === b.sharePrice &&
    a.lossUnrealized === b.lossUnrealized &&
    a.cover === b.cover &&
    a.coverRequired === b.coverRequired
  )
}

export function recordSample(data: DashboardData | null | undefined) {
  if (!data) return
  const { vault, broker } = data
  if (!vault && !broker) return

  const price = vault ? sharePrice(vault.assetsTotal, vault.outstandingShares, vault.assetScale, vault.shareScale) : null

  const next: Sample = {
    t: Date.now(),
    clock: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    sharePrice: price === null ? null : Number(price.replace(/,/g, '')),
    lossUnrealized: vault ? baseToNumber(vault.lossUnrealized, vault.assetScale) : null,
    cover: broker ? baseToNumber(broker.coverAvailable) : null,
    coverRequired: broker ? baseToNumber(minimumCover(broker.debtTotal, broker.coverRateMinimum)) : null,
  }

  const last = samples[samples.length - 1]
  // A ledger closes every ~4s whether or not the demo did anything. Recording an identical
  // sample each time would flatten the interesting moments into a long straight line, so an
  // unchanged reading only extends the series when it is the most recent point.
  if (last && sameShape(last, next)) {
    samples[samples.length - 1] = next
  } else {
    samples.push(next)
    if (samples.length > MAX_SAMPLES) samples.shift()
  }
  publish()
}

export function useHistory(): Sample[] {
  const [series, setSeries] = useState<Sample[]>(() => samples.slice())

  useEffect(() => {
    listeners.add(setSeries)
    return () => {
      listeners.delete(setSeries)
    }
  }, [])

  return series
}
