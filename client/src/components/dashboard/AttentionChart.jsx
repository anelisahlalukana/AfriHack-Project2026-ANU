import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { hasAttention } from '../../lib/dashboardCharts'
import ChartLinkTick from './ChartLinkTick'
import ChartTooltip from './ChartTooltip'
import { ATTENTION, BAR_LANE, CURSOR, STATIC, VALUE_LABEL } from './chartTheme'

// What is waiting for the adviser, one bar per queue: red where it is overdue or expired. The
// label and the bar both open the page where it gets dealt with.
export default function AttentionChart({ rows }) {
  const navigate = useNavigate()
  if (!hasAttention(rows)) return <p className="empty">Nothing needs attention right now.</p>

  return <figure className="dash-chart" aria-label="Items that need attention">
    <p className="sr-only">{rows.map(row => `${row.label}: ${row.value}`).join(', ')}</p>
    <ResponsiveContainer width="100%" height={rows.length * 44 + 8}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 0 }} barCategoryGap="32%">
        <XAxis type="number" hide allowDecimals={false} domain={[0, max => Math.max(max, 4)]} />
        <YAxis type="category" dataKey="label" width={170} axisLine={false} tickLine={false} tick={<ChartLinkTick rows={rows} />} />
        <Tooltip content={<ChartTooltip />} cursor={CURSOR} />
        <Bar dataKey="value" barSize={14} radius={[0, 6, 6, 0]} background={BAR_LANE} style={{ cursor: 'pointer' }} onClick={(_, index) => navigate(rows[index].to)} {...STATIC}>
          {rows.map(row => <Cell key={row.key} fill={row.urgent ? ATTENTION.urgent : ATTENTION.normal} />)}
          <LabelList dataKey="value" position="right" {...VALUE_LABEL} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </figure>
}
