import { Link } from 'react-router-dom'
import { AXIS } from './chartTheme'

// A chart axis label that links to where that number is dealt with. Recharts draws ticks inside
// the SVG, where a react-router <Link> renders as an SVG <a>, so the label stays a real,
// keyboard-focusable link. A row without a `to` is plain text.
export default function ChartLinkTick({ x, y, payload, rows }) {
  const row = rows.find(item => item.label === payload.value)
  const text = <text x={x} y={y} dy={4} textAnchor="end" {...AXIS}>{payload.value}</text>
  return row?.to ? <Link to={row.to} className="dash-tick">{text}</Link> : text
}
