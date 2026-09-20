import { plural } from '../../lib/dashboardFormat'

// Hover card for the dashboard bar charts: "Label: value", plus the row's `detail` line if it has one.
export default function ChartTooltip({ active, payload, unit }) {
  const row = active && payload?.[0]?.payload
  if (!row) return null
  return <div className="dash-tooltip">
    <b>{row.label}: {unit ? plural(row.value, unit) : row.value}</b>
    {row.detail && <small>{row.detail}</small>}
  </div>
}
