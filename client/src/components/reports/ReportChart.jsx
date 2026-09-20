import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatAxisValue, formatValue, hasData, periodLabel, preferHorizontalBars, withShares } from '../../lib/reportFormat'

// Colours live in Reports.css as CSS variables (--rpt-c1 … --rpt-c6 in a fixed order, plus
// status colours), scoped to .rpt-page with separate light and dark steps. The fallbacks here
// are the light steps, in case the stylesheet hasn't loaded.
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']
const color = i => `var(--rpt-c${(i % PALETTE.length) + 1}, ${PALETTE[i % PALETTE.length]})`
const GOOD = 'var(--rpt-good, #12996b)'
const BAD = 'var(--rpt-bad, #d92d20)'
const NEUTRAL = 'var(--rpt-neutral, #7d8eac)'
// Series whose colour means something (good/bad/none) keep it wherever they appear.
const SEMANTIC = {
  on_track: GOOD, signed: GOOD, clear: GOOD, completed: GOOD, assets: GOOD,
  behind: BAD, missing: BAD, flagged: BAD, declined: BAD, liabilities: BAD,
  cancelled: NEUTRAL, not_screened: NEUTRAL, no_provider: NEUTRAL, not_recorded: NEUTRAL,
  open: color(0), waiting_on_us: color(1), waiting_on_client: color(2), claimed: color(0), paid: color(2),
}
// Meaningful colours by key ("declined") or, for custom queries, by label ("Waiting on client").
const semanticFor = key => SEMANTIC[String(key).toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '')]
const seriesColor = (series, i) => semanticFor(series.key) || semanticFor(series.label) || color(i)
// Keep legend items in series order (Recharts sorts them alphabetically by default).
const legendOrder = series => item => series.findIndex(s => s.key === item.dataKey)

const AXIS = { fontSize: 12, fill: 'var(--rpt-axis, #667085)' }
const GRID = 'var(--rpt-grid, #e3e9f1)'
const TOOLTIP = {
  contentStyle: { background: 'var(--card, #fff)', border: '1px solid var(--border, #e3e9f1)', borderRadius: 10, boxShadow: 'var(--shadow)', fontSize: 13, padding: '8px 12px', color: 'var(--text-2, #344054)' },
  labelStyle: { color: 'var(--text, #101828)', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: 'var(--text-2, #344054)' },
  cursor: { fill: 'var(--rpt-hover, #f4f7fb)' },
}

function BarReport({ result, compact, animate }) {
  const { rows, series, unit, stacked } = result
  const horizontal = preferHorizontalBars(rows, compact)
  const height = horizontal ? Math.max(compact ? 180 : 220, rows.length * (compact ? 34 : 44) + 60) : compact ? 230 : 300
  const last = series.length - 1
  const radius = i => {
    if (stacked && i !== last) return 0
    return horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]
  }
  return <ResponsiveContainer width="100%" height={height}>
    <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 16, bottom: 4, left: horizontal ? 8 : 0 }} barCategoryGap="28%">
      <CartesianGrid stroke={GRID} horizontal={!horizontal} vertical={horizontal} />
      {horizontal
        ? <>
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={unit === 'rating'} tickFormatter={v => formatAxisValue(v, unit)} domain={unit === 'rating' ? [0, 5] : unit === '%' ? [0, 100] : undefined} />
          <YAxis type="category" dataKey="label" tick={AXIS} axisLine={false} tickLine={false} width={compact ? 120 : 150} />
        </>
        : <>
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={unit === 'rating'} width={unit === 'rand' ? 60 : 44} tickFormatter={v => formatAxisValue(v, unit)} domain={unit === 'rating' ? [0, 5] : unit === '%' ? [0, 100] : undefined} />
        </>}
      <Tooltip {...TOOLTIP} formatter={(value, name) => [formatValue(value, unit), name]} />
      {series.length > 1 && <Legend iconType="circle" iconSize={9} itemSorter={legendOrder(series)} wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />}
      {series.map((s, i) => <Bar key={s.key} isAnimationActive={animate} dataKey={s.key} name={s.label} fill={seriesColor(s, i)} stackId={stacked ? 'stack' : undefined} radius={radius(i)} maxBarSize={52}
        stroke={stacked ? 'var(--rpt-surface, #fff)' : undefined} strokeWidth={stacked ? 1.5 : 0} />)}
    </BarChart>
  </ResponsiveContainer>
}

function LineReport({ result, compact, animate }) {
  const { rows, series, unit } = result
  return <ResponsiveContainer width="100%" height={compact ? 230 : 300}>
    <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={periodLabel} minTickGap={16} />
      <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={unit === 'rating'} width={unit === 'rand' ? 60 : 40} tickFormatter={v => formatAxisValue(v, unit)} />
      <Tooltip {...TOOLTIP} cursor={{ stroke: 'var(--border-strong, #cfd9e6)' }} labelFormatter={periodLabel} formatter={(value, name) => [formatValue(value, unit), name]} />
      {series.length > 1 && <Legend iconType="circle" iconSize={9} itemSorter={legendOrder(series)} wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />}
      {series.map((s, i) => <Line key={s.key} isAnimationActive={animate} type="monotone" dataKey={s.key} name={s.label} stroke={seriesColor(s, i)} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: seriesColor(s, i) }} activeDot={{ r: 5, stroke: 'var(--rpt-surface, #fff)', strokeWidth: 2 }} />)}
    </LineChart>
  </ResponsiveContainer>
}

function DonutReport({ result, compact, animate }) {
  const rows = withShares(result.rows.filter(r => Number(r.value) > 0))
  const total = rows.reduce((sum, r) => sum + r.value, 0)
  return <div className="rpt-donut">
    <div className="rpt-donut-chart">
      <ResponsiveContainer width="100%" height={compact ? 200 : 240}>
        <PieChart>
          <Pie isAnimationActive={animate} data={rows} dataKey="value" nameKey="label" innerRadius="60%" outerRadius="88%" paddingAngle={2} cornerRadius={4} stroke="var(--rpt-surface, #fff)" strokeWidth={2}>
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

// The numbers behind a chart, for anyone who can't rely on colour (or wants the exact values).
function DataTable({ result }) {
  const keys = result.series?.length ? result.series : [{ key: 'value', label: 'Value' }]
  return <details className="rpt-data rpt-no-print">
    <summary>View the data</summary>
    <div className="table-scroll">
      <table>
        <thead><tr><th>{result.period ? `${result.period[0].toUpperCase()}${result.period.slice(1)}` : 'Group'}</th>{keys.map(s => <th key={s.key} className="num">{s.label}</th>)}</tr></thead>
        <tbody>{result.rows.map(row => <tr key={row.label}><td>{periodLabel(row.label)}</td>{keys.map(s => <td key={s.key} className="num">{formatValue(row[s.key], result.unit)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </details>
}

// animate={false} for the written report: printing re-lays out the charts, and an animation
// restarting at that moment would print empty bars.
export default function ReportChart({ result, linkClients = false, compact = false, showData = false, animate = true }) {
  if (!hasData(result)) {
    return <div className="empty rpt-empty">
      {result?.notice ? <p className="rpt-notice">{result.notice}</p> : <p>No data for this report yet.</p>}
    </div>
  }
  const label = `${result.template?.label || result.title || 'Report'} chart`
  const plotted = ['bar', 'line', 'donut'].includes(result.chartType)
  return <figure className="rpt-chart" aria-label={label}>
    {result.chartType === 'stat' && <StatReport result={result} />}
    {result.chartType === 'table' && <TableReport result={result} linkClients={linkClients} />}
    {result.chartType === 'line' && <LineReport result={result} compact={compact} animate={animate} />}
    {result.chartType === 'donut' && <DonutReport result={result} compact={compact} animate={animate} />}
    {result.chartType === 'bar' && <BarReport result={result} compact={compact} animate={animate} />}
    {showData && plotted && <DataTable result={result} />}
  </figure>
}
