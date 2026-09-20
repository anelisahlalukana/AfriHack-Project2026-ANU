import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { total } from '../../lib/dashboardCharts'
import ChartLinkTick from './ChartLinkTick'
import ChartTooltip from './ChartTooltip'
import { BAR_LANE, COLORS, CURSOR, STATIC, VALUE_LABEL } from './chartTheme'

// How the client book splits across risk profiles, cautious to bold, plus who hasn't been
// assessed yet. Each bar opens the Clients table filtered to that profile.
export default function RiskMixChart({ rows }) {
  const navigate = useNavigate()
  if (!total(rows)) return <p className="empty">No clients yet.</p>

  return <figure className="dash-chart" aria-label="Clients by risk profile">
    <p className="sr-only">{rows.map(row => `${row.label}: ${row.value}`).join(', ')}</p>
    <ResponsiveContainer width="100%" height={rows.length * 34 + 8}>
      <BarChart data={rows} layout="vertical" margin={{ top: 2, right: 32, bottom: 2, left: 0 }} barCategoryGap="30%">
        <XAxis type="number" hide allowDecimals={false} domain={[0, max => Math.max(max, 4)]} />
        <YAxis type="category" dataKey="label" width={100} axisLine={false} tickLine={false} tick={<ChartLinkTick rows={rows} />} />
        <Tooltip content={<ChartTooltip unit="client" />} cursor={CURSOR} />
        <Bar dataKey="value" barSize={12} radius={[0, 6, 6, 0]} background={BAR_LANE} style={{ cursor: 'pointer' }} onClick={(_, index) => rows[index].to && navigate(rows[index].to)} {...STATIC}>
          {rows.map(row => <Cell key={row.key} fill={COLORS[row.key] || COLORS.other} />)}
          <LabelList dataKey="value" position="right" {...VALUE_LABEL} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </figure>
}
