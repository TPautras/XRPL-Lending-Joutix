import { TFEUR_SCALE } from '../../protocol/lib/mpt'
import { NETWORK } from './network'

export { TFEUR_SCALE }

/**
 * Every amount this app reads off the ledger is an integer in the funding asset's base
 * units — TFEUR has `AssetScale: 2`, so `AssetsTotal: "3500000"` means €35,000.00. That
 * convention cost us a 100x-wrong loan once already (docs/FRICTION.md, `PrincipalRequested`),
 * so the scaling lives here and nowhere else: it happens once, at the render edge, as
 * string arithmetic. No float ever touches a ledger amount, and nothing formatted here is
 * ever submitted anywhere — the webapp signs nothing.
 *
 * Returns `null` for anything that is not a plain decimal so callers can show the raw
 * value instead of a confidently wrong number.
 */
export function baseToDecimal(
  raw: string | number | null | undefined,
  scale = TFEUR_SCALE,
  decimals = 2,
): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  const text = String(raw).trim()
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null

  const negative = text.startsWith('-')
  const [intPart, fracPart = ''] = (negative ? text.slice(1) : text).split('.')
  const digits = intPart + fracPart
  // Shifting the decimal point `scale` places left is a move within `digits`, not a division.
  const pointAt = intPart.length - scale
  let whole = pointAt > 0 ? digits.slice(0, pointAt) : '0'
  let frac = pointAt > 0 ? digits.slice(pointAt) : '0'.repeat(-pointAt) + digits

  whole = whole.replace(/^0+(?=\d)/, '')
  // Truncated, not rounded: for an integer base-unit input `frac` is already exact, and
  // rounding a displayed balance up is the one direction that can mislead.
  frac = decimals === 0 ? '' : (frac + '0'.repeat(decimals)).slice(0, decimals)

  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = negative && /[1-9]/.test(whole + frac) ? '-' : ''
  return `${sign}${grouped}${frac ? `.${frac}` : ''}`
}

/** `€35,000.00`, or an em dash when the value is absent/unparseable. A negative amount
 * reads `-€123.45`, with the sign outside the symbol, not `€-123.45`. */
export function eur(raw: string | number | null | undefined, scale = TFEUR_SCALE): string {
  const formatted = baseToDecimal(raw, scale)
  if (formatted === null) return '—'
  return formatted.startsWith('-') ? `-€${formatted.slice(1)}` : `€${formatted}`
}

/** A count of base units with no currency symbol (vault shares, premium counts). */
export function units(raw: string | number | null | undefined, scale = TFEUR_SCALE): string {
  return baseToDecimal(raw, scale) ?? '—'
}

/**
 * Share price = assets per share, both sides read off `vault_info`. The two MPTs can
 * carry different `AssetScale`s, so the scales cancel explicitly rather than by assuming
 * they match. Integer math with four decimals of headroom.
 */
export function sharePrice(
  assetsTotal: string | number | null | undefined,
  outstandingShares: string | number | null | undefined,
  assetScale = TFEUR_SCALE,
  shareScale = TFEUR_SCALE,
): string | null {
  try {
    const assets = BigInt(String(assetsTotal ?? '0').split('.')[0])
    const shares = BigInt(String(outstandingShares ?? '0').split('.')[0])
    if (shares === 0n) return null
    const scaled = (assets * 10n ** BigInt(shareScale) * 10n ** 4n) / (shares * 10n ** BigInt(assetScale))
    return baseToDecimal(scaled.toString(), 4, 4)
  } catch {
    return null
  }
}

/** `CoverRateMinimum` is in thousandths of a percent: 100000 = 100%. */
export function coverRatePercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '—'
  return `${(rate / 1000).toFixed(1)}%`
}

/** Minimum cover the broker must hold for its current debt, in base units. */
export function minimumCover(debtTotal: string | number, coverRateMinimum: number): string {
  try {
    const debt = BigInt(String(debtTotal).split('.')[0])
    return ((debt * BigInt(Math.round(coverRateMinimum))) / 100000n).toString()
  } catch {
    return '0'
  }
}

/** 0–100 for a progress bar. Display-only: a bar width is the one place a float is fine. */
export function fillPercent(part: string | number, whole: string | number): number {
  const p = Number(part)
  const w = Number(whole)
  if (!Number.isFinite(p) || !Number.isFinite(w) || w <= 0) return 0
  return Math.max(0, Math.min(100, (p / w) * 100))
}

const RIPPLE_EPOCH_OFFSET = 946_684_800

/** Ripple-epoch seconds (`NextPaymentDueDate`, `CancelAfter`, `close_time`) → a JS Date. */
export function rippleTimeToDate(rippleSeconds: number): Date {
  return new Date((rippleSeconds + RIPPLE_EPOCH_OFFSET) * 1000)
}

export function clockTime(rippleSeconds: number | null | undefined): string {
  if (!rippleSeconds) return '—'
  return rippleTimeToDate(rippleSeconds).toLocaleTimeString()
}

export function shortHash(hash: string, head = 10, tail = 6): string {
  if (!hash) return '—'
  return hash.length <= head + tail + 1 ? hash : `${hash.slice(0, head)}…${hash.slice(-tail)}`
}

export function shortAddress(address: string): string {
  return shortHash(address, 8, 4)
}

export function txUrl(hash: string): string {
  return `${NETWORK.explorer}/transactions/${hash}`
}

export function accountUrl(address: string): string {
  return `${NETWORK.explorer}/accounts/${address}`
}

export function isoToClock(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString()
}

export function isoToDateTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

/** `1m 20s`, for countdowns measured in ledger time. */
export function durationLabel(totalSeconds: number): string {
  const seconds = Math.abs(Math.round(totalSeconds))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return seconds % 60 ? `${minutes}m ${seconds % 60}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`
}

/** `in 1m 20s` / `overdue by 45s`, or `—` when either side of the comparison is unknown. */
export function countdown(targetRippleTime: number | null | undefined, nowRippleTime: number | null): string {
  if (!targetRippleTime || nowRippleTime === null) return '—'
  const delta = targetRippleTime - nowRippleTime
  return delta >= 0 ? `in ${durationLabel(delta)}` : `overdue by ${durationLabel(delta)}`
}

/** `a - b` on two base-unit amounts, as integers. Returns `'0'` if either side is not a
 * plain integer string — CLAUDE.md's rule is no float math on ledger amounts, and a
 * subtraction done in doubles is exactly where that rule gets broken quietly. */
export function subtractBase(a: string | number, b: string | number): string {
  try {
    return (BigInt(String(a).split('.')[0]) - BigInt(String(b).split('.')[0])).toString()
  } catch {
    return '0'
  }
}

/** `a < b` on base-unit amounts, integer-safe, false when either side is unparseable. */
export function lessThanBase(a: string | number, b: string | number): boolean {
  try {
    return BigInt(String(a).split('.')[0]) < BigInt(String(b).split('.')[0])
  } catch {
    return false
  }
}
