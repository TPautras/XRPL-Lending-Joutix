/**
 * Display-edge formatting. Nothing here ever feeds a transaction.
 *
 * Every ledger amount in TrustFlow — `AssetsTotal`, `AssetsAvailable`, `LossUnrealized`,
 * `CoverAvailable`, `DebtTotal`, `PrincipalOutstanding`, `TotalValueOutstanding`,
 * `PeriodicPayment`, the escrow's `Amount` — is a count of TFEUR **base units**, i.e.
 * cents (`AssetScale = 2`). They arrive as strings, and a "Number" field can carry a
 * fraction (`PeriodicPayment: "200000.3805174906852"`), so parse with `Number()` and
 * divide only here, on the way to the screen.
 */
export const TFEUR_SCALE = 2

/**
 * The demo asset's ticker, from the `MPTokenMetadata` the issuer actually minted:
 * `{ ticker: 'TFEUR', name: 'TrustFlow demo EUR' }`.
 *
 * Never render these amounts with a bare `€`. TFEUR is a Multi-Purpose Token on a
 * devnet, issued by one of our own accounts against nothing — it is denominated in
 * euros, it is not euros, and a euro sign on stage claims a fiat redemption nobody
 * here can honour. Show the ticker.
 */
export const TICKER = 'TFEUR'

/** "12,345.67" from the raw base-unit count 1234567. Bare, for use under a column
 * header that already names the unit. */
export function amount(baseUnits: number | string | undefined): string {
  const n = Number(baseUnits ?? 0)
  if (!Number.isFinite(n)) return '—'
  return (n / 10 ** TFEUR_SCALE).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** "12,345.67 TFEUR" — the form to use anywhere the unit isn't already stated. */
export function tfeur(baseUnits: number | string | undefined): string {
  return `${amount(baseUnits)} ${TICKER}`
}

/** Share count, same base-unit convention, but shown without a currency reading. */
export function units(baseUnits: number | string | undefined): string {
  const n = Number(baseUnits ?? 0)
  if (!Number.isFinite(n)) return '—'
  return (n / 10 ** TFEUR_SCALE).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * Share price is `AssetsTotal / OutstandingAmount` — a ratio of two base-unit counts,
 * so it is already scale-free and must NOT be divided again. Six decimals because the
 * whole point on stage is watching it move, and over a 60-second payment interval the
 * interest is fractions of a cent.
 */
export function sharePrice(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—'
  return ratio.toFixed(6)
}

/** Cover rates are 1/10th of a basis point: 10000 → "10.0%". */
export function rate(tenthBps: number): string {
  return `${(tenthBps / 1000).toFixed(1)}%`
}

export function percent(fraction: number, digits = 0): string {
  if (!Number.isFinite(fraction)) return '—'
  return `${(fraction * 100).toFixed(digits)}%`
}

/** The XRPL epoch is 2000-01-01, 946684800 seconds after the Unix epoch. */
export const RIPPLE_EPOCH = 946684800

export function rippleNow(): number {
  return Math.floor(Date.now() / 1000) - RIPPLE_EPOCH
}

export function rippleToDate(rippleTime: number): Date {
  return new Date((rippleTime + RIPPLE_EPOCH) * 1000)
}

/** "in 2m 04s" / "12s ago" — demo intervals are seconds, so keep the unit small. */
export function countdown(seconds: number): string {
  const past = seconds < 0
  const s = Math.abs(Math.round(seconds))
  const text = s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
  return past ? `${text} ago` : `in ${text}`
}

export function clock(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour12: false })
}

/** Ledger object ids are 64 hex characters; nobody reads the middle. */
export function shortId(id: string | undefined): string {
  if (!id) return '—'
  return id.length <= 16 ? id : `${id.slice(0, 8)}…${id.slice(-6)}`
}
