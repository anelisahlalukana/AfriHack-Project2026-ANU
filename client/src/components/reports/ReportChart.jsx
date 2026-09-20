import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatAxisValue, formatValue, hasData, periodLabel, preferHorizontalBars, withShares } from '../../lib/reportFormat'

// Colours live in Reports.css as CSS variables (--rpt-c1 … --rpt-c6, --rpt-good, --rpt-bad),
// scoped to .rpt-page so nothing outside the Reports page changes. Fallbacks keep charts
// readable if the stylesheet hasn't loaded.
const PALETTE = ['#a30b14', '#8a7b72', '#c79a7e', '#4f6b5a', '#b58a2a', '#5b4a41']
const color = i => `var(--rpt-c${(i % PALETTE.length) + 1}, ${PALETTE[i % PALETTE.length]})`
const SEMANTIC = {
  on_track: 'var(--rpt-good, #3c7650)',
  signed: 'var(--rpt-good, #3c7650)',
  behind: 'var(--rpt-bad, #a30b14)',
  missing: 'var(--rpt-bad, #a30b14)',
  clear: 'var(--rpt-good, #3c7650)',
  flagged: 'var(--rpt-bad, #a30b14)',
  not_screened: 'var(--rpt-c2, #8a7b72)',
  completed: 'var(--rpt-good, #3c7650)',
  declined: 'var(--rpt-bad, #a30b14)',
  open: 'var(--rpt-c5, #b58a2a)',
  cancelled: 'var(--rpt-c6, #5b4a41)',
  waiting_on_us: 'var(--rpt-bad, #a30b14)',
  waiting_on_client: 'var(--rpt-c3, #c79a7e)',
  assets: 'var(--rpt-good, #3c7650)',
  liabilities: 'var(--rpt-bad, #a30b14)',
}
// Meaningful colours by key ("declined") or, for custom queries, by label ("Waiting on client").
const semanticFor = key => SEMANTIC[String(key).toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '')]
const seriesColor = (series, i) => semanticFor(series.key) || semanticFor(series.label) || color(i)
// Keep legend items in series order (Recharts sorts them alphabetically by default).
const legendOrder = series => item => series.findIndex(s => s.key === item.dataKey)

const AXIS = { fontSize: 12, fill: 'var(--rpt-axis, #7a6c62)' }
const GRID = 'var(--rpt-grid, #eee6e0)'
const TOOLTIP = {
  contentStyle: { background: '#fffdfa', border: '1px solid #dfd6cf', borderRadius: 10, boxShadow: '0 6px 20px rgba(41,35,31,.12)', fontSize: 13, padding: '8px 12px' },
  labelStyle: { color: '#29231f', fontWeight: 600, marginBottom: 4 },
  cursor: { fill: 'var(--rpt-hover, #f4eee9)' },
}

function BarReport({ result }) {
  const { rows, series, unit, stacked } = result
  const horizontal = preferHorizontalBars(rows)
  const height = horizontal ? Math.max(220, rows.length * 44 + 60) : 300
  const last = series.length - 1
  const radius = i => {
    if (stacked && i !== last) return 0
    return horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]
  }
  return <ResponsiveContainer width="100%" height={height}>
    <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 16, bottom: 4, left: horizontal ? 8 : 0 }} barCategoryGap="28%">
      <CartesianGrid stroke={GRID} horizontal={!horizontal} vertical={horizontal} />
      {horizontal
        ? <>
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={unit === 'rating'} tickFormatter={v => formatAxisValue(v, unit)} domain={unit === 'rating' ? [0, 5] : unit === '%' ? [0, 100] : undefined} />
          <YAxis type="category" dataKey="label" tick={AXIS} axisLine={false} tickLine={false} width={150} />
        </>
        : <>
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={unit === 'rating'} width={unit === 'rand' ? 60 : 44} tickFormatter={v => formatAxisValue(v, unit)} domain={unit === 'rating' ? [0, 5] : unit === '%' ? [0, 100] : undefined} />
        </>}
      <Tooltip {...TOOLTIP} formatter={(value, name) => [formatValue(value, unit), name]} />
      {series.length > 1 && <Legend iconType="circle" iconSize={9} itemSorter={legendOrder(series)} wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />}
      {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={seriesColor(s, i)} stackId={stacked ? 'stack' : undefined} radius={radius(i)} maxBarSize={52} />)}
    </BarChart>
  </ResponsiveContainer>
}

function LineReport({ result }) {
  const { rows, series, unit } = result
  return <ResponsiveContainer width="100%" height={300}>
    <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={periodLabel} minTickGap={16} />
      <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
      <Tooltip {...TOOLTIP} cursor={{ stroke: '#d9cdc3' }} labelFormatter={periodLabel} formatter={(value, name) => [formatValue(value, unit), name]} />
      {series.length > 1 && <Legend iconType="circle" iconSize={9} itemSorter={legendOrder(series)} wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />}
      {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={seriesColor(s, i)} strokeWidth={2.25} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />)}
    </LineChart>
  </ResponsiveContainer>
}

function DonutReport({ result }) {
  const rows = withShares(result.rows.filter(r => Number(r.value) > 0))
  const total = rows.reduce((sum, r) => sum + r.value, 0)
  return <div className="rpt-donut">
    <div className="rpt-donut-chart">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="label" innerRadius="60%" outerRadius="88%" paddingAngle={2} cornerRadius={4} stroke="none">
            {rows.map((row, i) => <Cell key={row.label} fill={semanticFor(row.label) || color(i)} />)}
          </Pie>
          <Tooltip {...TOOLTIP} formatter={(value, name) => [formatValue(value, result.unit), name]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="rpt-donut-total" aria-hidden="true"><strong>{total}</strong><span>{result.unit}</span></div>
    </div>
    <ul className="rpt-legend">
      {rows.map((row, i) => <li key={row.label}><i style={{ background: semanticFor(row.label) || color(i) }} /><span>{row.label}</span><b>{row.value}</b><small>{row.share}%</small></li>)}
    </ul>
  </div>
}

function idleBadge(days) {
  return <span className={`badge${days > 14 ? ' status-flagged' : ' status-sent'}`}>{days} days</span>
}

// Column kinds: client (links to the client), task (links to the claim/request), idle (age badge).
function TableCell({ column, row, linkClients }) {
  const value = row[column.key]
  if (column.kind === 'client' && linkClients && row.clientId) return <Link className="client-name" to={`/clients/${row.clientId}`}>{value}</Link>
  if (column.kind === 'task' && linkClients && row.taskId) return <Link className="client-name" to={`/tasks/${row.taskId}`}>{value}</Link>
  if (column.kind === 'idle') return idleBadge(value)
  if (column.key === 'daysLeft') return daysBadge(value)
  if (column.key === 'client' && linkClients && row.clientId) return <Link className="client-name" to={`/clients/${row.clientId}`}>{value}</Link>
  return value
}

function daysBadge(days) {
  if (days <= 0) return <span className="badge status-flagged">Expired</span>
  return <span className={`badge${days <= 14 ? ' status-sent' : ''}`}>{days} days</span>
}

function TableReport({ result, linkClients }) {
  return <div className="table-scroll">
    <table className="rpt-table">
      <thead><tr>{result.columns.map(c => <th key={c.key} className={c.numeric ? 'num' : undefined}>{c.label}</th>)}</tr></thead>
      <tbody>
        {result.rows.map(row => <tr key={row.taskId || row.clientId || JSON.stringify(row)}>
          {result.columns.map(c => <td key={c.key} className={c.numeric ? 'num' : undefined}>
            <TableCell column={c} row={row} linkClients={linkClients} />
          </td>)}
        </tr>)}
      </tbody>
    </table>
  </div>
}

// A single number (e.g. "How many motor claims were declined this year?").
function StatReport({ result }) {
  return <div className="rpt-stats">
    {result.rows.map(row => <div className="rpt-stat" key={row.label}>
      <strong>{formatValue(row.value, ['rand', '%', 'rating', 'days', 'hours'].includes(result.unit) ? result.unit : undefined)}</strong>
      <span>{row.label}</span>
    </div>)}
  </div>
}

export default function ReportChart({ result, linkClients = false }) {
  if (!hasData(result)) return <div className="empty rpt-empty"><p>No data for this report yet.</p></div>
  const label = `${result.template?.label || 'Report'} chart`
  return <figure className="rpt-chart" aria-label={label}>
    {result.chartType === 'stat' && <StatReport result={result} />}
    {result.chartType === 'table' && <TableReport result={result} linkClients={linkClients} />}
    {result.chartType === 'line' && <LineReport result={result} />}
    {result.chartType === 'donut' && <DonutReport result={result} />}
    {result.chartType === 'bar' && <BarReport result={result} />}
  </figure>
}
