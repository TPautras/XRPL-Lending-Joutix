import type { Client } from 'xrpl'
import { isoTimeToRippleTime } from 'xrpl'

export function rippleNow(): number {
  return isoTimeToRippleTime(new Date().toISOString())
}

export function rippleTimePlusSeconds(seconds: number, from: Date = new Date()): number {
  return isoTimeToRippleTime(new Date(from.getTime() + seconds * 1000).toISOString())
}

/** The ledger's `close_time` is already Ripple-epoch seconds — the same epoch as
 * `NextPaymentDueDate`/`GracePeriod` math — so no conversion is needed here. Loan
 * timing must be checked against this, never against wall-clock `Date.now()`. */
export async function ledgerRippleTime(client: Client): Promise<number> {
  const { result } = await client.request({ command: 'ledger', ledger_index: 'validated' })
  return (result.ledger as { close_time: number }).close_time
}

export async function waitUntilRippleTime(
  client: Client,
  target: number,
  pollMs = 4000,
): Promise<void> {
  for (;;) {
    const now = await ledgerRippleTime(client)
    const remaining = target - now
    if (remaining <= 0) return
    console.log(`  waiting ~${remaining}s of ledger time...`)
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, remaining * 1000 + 500)))
  }
}
