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
    <div style={{ height }} className="-mx-1">
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
            width={62}
            tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => format(value)}
            domain={['auto', 'auto']}
          />
          <Tooltip
            cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
            content={<TrendTooltip format={format} name={name} color={color} />}
          />
          {referenceValue !== null && referenceValue !== undefined && (
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
  )
}
