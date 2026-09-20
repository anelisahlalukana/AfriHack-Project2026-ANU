import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { monthLabel, monthName, niceTicks } from '../../lib/trend'
import { AXIS, STATIC, TREND } from './chartTheme'

function TrendTooltip({ active, payload }) {
  const row = active && payload?.[0]?.payload
  if (!row) return null
  return <div className="dash-tooltip">
    <b>{monthName(row.label)}</b>
    <span className="dash-tip-line"><i className="dash-ring" />This period <b>{row.value}</b></span>
    {row.previous !== undefined && <span className="dash-tip-line"><i className="dash-dashed" />Previous period <b>{row.previous}</b></span>}
  </div>
}

// Claims and requests logged per month: a smooth blue line with hollow dots over a soft gradient,
// and a dashed grey line for the same stretch before it. Rows are { label: '2026-03', value, previous }.
export default function TrendChart({ rows }) {
  const ticks = niceTicks(Math.max(...rows.flatMap(row => [row.value, row.previous ?? 0])))
  const labels = new Map(rows.map((row, index) => [row.label, monthLabel(row.label, index)]))

  return <figure className="dash-chart" aria-label="Claims and requests logged per month">
    <p className="sr-only">{rows.map(row => `${monthName(row.label)}: ${row.value}`).join(', ')}</p>
    <ul className="dash-trend-legend" aria-hidden="true">
      <li><i className="dash-ring" />This period</li>
      <li><i className="dash-dashed" />Previous period</li>
    </ul>
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={rows} margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="dash-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TREND.line} stopOpacity={0.3} />
            <stop offset="100%" stopColor={TREND.line} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={TREND.grid} />
        <XAxis dataKey="label" tickFormatter={label => labels.get(label)} tick={AXIS} axisLine={false} tickLine={false} tickMargin={10} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={34} ticks={ticks} domain={[0, ticks.at(-1)]} />
        <Tooltip content={<TrendTooltip />} cursor={{ stroke: TREND.previous, strokeDasharray: '4 4' }} />
        <Line type="monotone" dataKey="previous" stroke={TREND.previous} strokeWidth={2} strokeDasharray="6 5" dot={false} activeDot={false} {...STATIC} />
        <Area type="monotone" dataKey="value" stroke={TREND.line} strokeWidth={2.5} fill="url(#dash-trend-fill)" dot={TREND.dot} activeDot={TREND.activeDot} {...STATIC} />
      </ComposedChart>
    </ResponsiveContainer>
  </figure>
}
