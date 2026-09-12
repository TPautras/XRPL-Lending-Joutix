import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Sample } from './useHistory'

/**
 * One measure, over time, on its own axis.
 *
 * Deliberately a single series per chart: share price, unrealized loss and posted cover are
 * three different scales, and putting two of them on one plot with two y-axes would invent a
 * correlation that is not in the data. Three small multiples share the x (ledger closes) and
 * each keeps its own y. A single series also needs no legend — the title says what is
 * plotted — so the only ink here is the mark, a hairline grid and the axis.
 *
 * Colours come from `--chart-1..3`, which are stepped for the dark card surface and checked
 * against it; the `--ok/--warn/--err` status tokens are deliberately not used as series
 * colours (they sit too light for a mark on this background, and they mean *state*, which a
 * trend line does not).
 */

export type TrendKey = 'sharePrice' | 'lossUnrealized' | 'cover'

const STROKE: Record<TrendKey, string> = {
  sharePrice: 'var(--chart-1)',
  lossUnrealized: 'var(--chart-2)',
  cover: 'var(--chart-3)',
}

function TrendTooltip({
  active,
  payload,
  label,
  format,
  name,
  color,
}: {
  active?: boolean
  payload?: Array<{ value?: number | string }>
  label?: string | number
  format: (value: number) => string
  name: string
  color: string
}) {
  if (!active || !payload?.length) return null
  const raw = payload[0]?.value
  if (raw === undefined || raw === null) return null

  return (
    <div className="bg-popover border-border rounded-lg border px-3 py-2 shadow-lg">
      {/* Values lead, labels follow: the reader already knows which chart they are on. */}
      <p className="m-0 text-base font-semibold">{format(Number(raw))}</p>
      <p className="text-muted-foreground m-0 flex items-center gap-2 text-xs">
        <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ background: color }} />
        {name}
      </p>
      <p className="text-muted-foreground m-0 mt-0.5 text-xs">{label}</p>
    </div>
  )
}

/**
 * Recharts' `['auto', 'auto']` pads a flat series into nonsense: a share price pinned at
 * 1.0000 came back with an axis running −1 to 3, and a loss series of pure zeros produced
 * ticks at 0, 1, 2, 4. Dividing the range evenly instead is no better — it lands on
 * €1,737.06 and €1,685.97, which nobody reads off an axis.
 *
 * So the step is snapped to a 1 / 2 / 2.5 / 5 × 10ⁿ progression and the bounds to multiples
 * of it, which is what makes ticks come out as round numbers. Every measure plotted here is
 * non-negative, so the floor never goes below zero.
 */
function niceScale(lo: number, hi: number, tickCount = 5): { domain: [number, number]; ticks: number[] } {
  if (lo === hi) {
    // A flat series has no range to divide. Zero gets a plain 0–1 axis; anything else gets a
    // narrow band around its own value so the line sits mid-card rather than on an edge.
    if (lo === 0) return { domain: [0, 1], ticks: [0, 0.5, 1] }
    const pad = Math.abs(lo) * 0.5
    lo -= pad
    hi += pad
  }

  const rawStep = (hi - lo) / (tickCount - 1)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / magnitude
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude

  const start = Math.max(0, Math.floor(lo / step) * step)
  const end = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let value = start; value <= end + step / 2; value += step) {
    // Floating-point accumulation would reintroduce the very noise this function removes.
    ticks.push(Number((Math.round(value / step) * step).toPrecision(12)))
  }
  return { domain: [start, end], ticks }
}

function axis(values: number[], reference: number | null): { domain: [number, number]; ticks: number[] } {
  const min = Math.min(...values)
  const max = Math.max(...values)
  // A reference only belongs on the same scale when it is anywhere near the data. The
  // minimum cover sits three orders of magnitude below the posted cover, and forcing it in
  // flattens the series into a line against the top edge.
  const near = reference !== null && reference >= min / 10 && reference <= max * 10
  return niceScale(near ? Math.min(min, reference) : min, near ? Math.max(max, reference) : max)
}

export function Trend({
  data,
  metric,
  name,
  format,
  referenceValue,
  referenceLabel,
  height = 132,
}: {
  data: Sample[]
  metric: TrendKey
  /** Names the single series — this is why the chart carries no legend box. */
  name: string
  format: (value: number) => string
  /** A limit the series is read against (the minimum cover the protocol requires). */
  referenceValue?: number | null
  referenceLabel?: string
  height?: number
}) {
  const points = data.filter((sample) => sample[metric] !== null)
  const color = STROKE[metric]
  const values = points.map((sample) => sample[metric] as number)
  const scale = values.length ? axis(values, referenceValue ?? null) : null
  // Said in words when it cannot honestly be drawn on this scale.
  const referenceOffScale =
    scale !== null && referenceValue !== null && referenceValue !== undefined && referenceValue < scale.domain[0]

  if (points.length < 2) {
    return (
      <div
        className="text-muted-foreground flex items-center justify-center rounded-lg border border-dashed px-3 text-center text-xs"
        style={{ height }}
      >
        Recording since this page opened — the shape appears on the second ledger close.
      </div>
    )
  }

  return (
    // The container is sized to include the x-axis band, so the card never grows a nested
    // scrollbar just to show the tick labels.
    // No negative margin: bleeding the chart 4px past its card made every chart container
    // report a horizontal overflow of its own.
    <div>
      {referenceOffScale && (
        <p className="text-muted-foreground mb-1 text-xs">
          {referenceLabel} is {format(referenceValue as number)} — too far below this range to plot on the same axis.
        </p>
      )}
      <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            {/* Solid hairlines. Recharts dashes its grid by default, which reads as
                "threshold" when it is only a grid. */}
            <CartesianGrid stroke="var(--chart-grid)" strokeWidth={1} strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="clock"
              tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--chart-grid)' }}
              minTickGap={44}
            />
            <YAxis
              width={68}
              tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => format(value)}
              domain={scale ? scale.domain : ['auto', 'auto']}
              ticks={scale ? scale.ticks : undefined}
              interval={0}
            />
            <Tooltip
              cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
              content={<TrendTooltip format={format} name={name} color={color} />}
            />
            {referenceValue !== null && referenceValue !== undefined && !referenceOffScale && (
              <ReferenceLine
                y={referenceValue}
                stroke="var(--chart-axis)"
                strokeWidth={1}
                label={{ value: referenceLabel, position: 'insideTopLeft', fill: 'var(--chart-axis)', fontSize: 11 }}
              />
            )}
            <Area
              type="monotone"
              dataKey={metric}
              name={name}
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={`url(#fill-${metric})`}
              isAnimationActive={false}
              dot={false}
              // >=8px, with a 2px ring in the surface colour so it stays legible where it
              // crosses the line or the reference.
              activeDot={{ r: 4.5, fill: color, stroke: 'var(--card)', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
