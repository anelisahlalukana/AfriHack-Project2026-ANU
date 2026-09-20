import { useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { useWorkTrend } from '../../hooks/useWorkTrend'
import { hasTrend } from '../../lib/trend'
import TrendChart from './TrendChart'

const PERIODS = [{ months: 6, label: 'Last 6 months' }, { months: 12, label: 'Last 12 months' }]

// The dashboard's trend card: how much work came in each month, against the period before.
export default function WorkTrend() {
  const [months, setMonths] = useState(6)
  const { loading, rows, error } = useWorkTrend(months)

  return <section className="card">
    <header className="section-heading">
      <div><h2><TrendingUp size={20} /> Work over time</h2><p>Claims and requests logged each month, against the period before.</p></div>
      <select className="dash-select" aria-label="Period" value={months} onChange={event => setMonths(Number(event.target.value))}>
        {PERIODS.map(period => <option key={period.months} value={period.months}>{period.label}</option>)}
      </select>
    </header>
    {loading
      ? <p className="empty" role="status">Loading…</p>
      : error
        ? <p className="error" role="alert">{error}</p>
        : hasTrend(rows) ? <TrendChart rows={rows} /> : <p className="empty">No claims or requests were logged in this period.</p>}
  </section>
}
