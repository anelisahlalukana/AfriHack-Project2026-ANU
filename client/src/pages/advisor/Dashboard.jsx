import { Link } from 'react-router-dom'
import { Bell, FileSignature, Plus, ShieldCheck, Target, TriangleAlert, Users, Wallet } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useDashboard } from '../../hooks/useDashboard'
import { money } from '../../lib/financials'
import { plural, relativeTime, share } from '../../lib/dashboardFormat'
import { attentionRows, riskRows } from '../../lib/dashboardCharts'
import AttentionChart from '../../components/dashboard/AttentionChart'
import RiskMixChart from '../../components/dashboard/RiskMixChart'
import WorkTrend from '../../components/dashboard/WorkTrend'

const QUALIFICATION_BADGE = { qualified: 'status-signed', pending: 'status-sent', suspended: 'status-flagged' }
const CPD_BADGE = { up_to_date: 'status-signed', in_progress: 'status-sent', not_started: 'status-sent', overdue: 'status-flagged' }
const label = value => String(value).replaceAll('_', ' ')

// `tone` ('positive' / 'negative') colours money in and money out; otherwise the bar is the default blue.
function Bar({ title, value, whole, display, assetBar, tone }) {
  return <div className="chart-row"><div><span>{title}</span><b>{display ?? value}</b></div><div className="track"><span style={{ width: `${share(value, whole)}%` }} className={tone ? `tone-${tone}` : assetBar ? 'asset-bar' : ''} /></div></div>
}

// The practice at a glance, kept live by useDashboard: charts of what needs attention now and how
// much work has come in over time, then the client book, money under advice, the onboarding pipeline,
// compliance and the latest activity.
export default function Dashboard() {
  const { session } = useAuth()
  const { data, error, refresh } = useDashboard()

  if (!data) return error
    ? <div className="card" role="alert"><p className="error">{error}</p><button onClick={refresh}>Try again</button></div>
    : <p role="status">Loading dashboard…</p>

  const { clients, portfolio, goals, documents, onboarding, activity, compliance } = data
  const updated = new Date(data.generatedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return <div className="dash-page">
    <header className="page-heading">
      <div>
        <h1>Dashboard</h1>
        <p>Everything that needs you, in one place.{' '}
          <span className={`live${error ? ' live-stale' : ''}`} role="status"><i aria-hidden="true" />{error ? 'Reconnecting, showing the last update' : 'Live'} · updated {updated}</span>
        </p>
      </div>
      <Link className="button primary" to="/clients?add=1"><Plus size={17} /> Add client</Link>
    </header>

    <div className="dash-charts">
      <section className="card">
        <header className="section-heading"><div><h2><TriangleAlert size={20} /> Needs attention</h2><p>Red means overdue or expired. Select a bar to open it.</p></div></header>
        <AttentionChart rows={attentionRows(data)} />
      </section>

      <WorkTrend />
    </div>

    <div className="two-columns">
      <section className="card">
        <header className="section-heading"><div><h2><Users size={20} /> Clients</h2><p>{plural(clients.total, 'client')} · {clients.newInWindow} new in the last {clients.newWindowDays} days</p></div><Link to="/clients">View all</Link></header>
        {Object.entries(clients.byStatus).map(([status, count]) => <Bar key={status} title={label(status)} value={count} whole={clients.total} assetBar />)}
        <div className="detail-row"><span>Fully documented<small>All 5 compliance documents signed</small></span><b>{documents.completeClients} of {clients.total}</b></div>
      </section>

      <section className="card">
        <header className="section-heading"><div><h2><Wallet size={20} /> Money under advice</h2><p>Recorded assets and liabilities across all clients.</p></div></header>
        <p style={{ margin: 0, fontFamily: 'Georgia, serif', fontSize: 30 }}>{money(portfolio.netWorth)}</p>
        <small>Combined net worth</small>
        <Bar title="Assets" value={portfolio.assets} whole={Math.max(portfolio.assets, portfolio.liabilities)} display={money(portfolio.assets)} tone="positive" />
        <Bar title="Liabilities" value={portfolio.liabilities} whole={Math.max(portfolio.assets, portfolio.liabilities)} display={money(portfolio.liabilities)} tone="negative" />
        <div className="detail-row"><span><Target size={16} /> Goals in progress<small>{goals.pastTargetDate ? `${goals.pastTargetDate} past their target date` : 'None past their target date'}</small></span><b>{goals.inProgress}</b></div>
        {goals.fundedPercent !== null && <Bar title="Goals funded so far" value={goals.totalProgress} whole={goals.totalTarget} display={`${goals.fundedPercent}%`} assetBar />}
      </section>
    </div>

    <section className="card" style={{ marginBottom: 20 }}>
      <header className="section-heading">
        <div><h2><FileSignature size={20} /> Onboarding pipeline</h2><p>{plural(onboarding.total, 'client')} onboarding · {onboarding.stalled} stalled ({onboarding.stalledAfterDays}+ days)</p></div>
        <Link to="/clients?status=onboarding">View all</Link>
      </header>
      {!onboarding.clients.length
        ? <p className="empty">No clients are onboarding right now.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th>Client</th><th>Documents signed</th><th>Waiting on</th><th>Time onboarding</th></tr></thead>
          <tbody>{onboarding.clients.map(client => <tr key={client.id}>
            <td><Link className="client-name" to={`/clients/${client.id}`} state={{ from: '/' }}>{client.name}</Link></td>
            <td style={{ minWidth: 140 }}><Bar title={`${client.signed} of 5`} value={client.signed} whole={5} assetBar /></td>
            <td>
              {client.awaitingClient > 0 && <span className="badge status-sent">{client.awaitingClient} awaiting client</span>}{' '}
              {client.notSent > 0 && <span className="badge">{client.notSent} not sent</span>}
            </td>
            <td><span className={`badge${client.stalled ? ' status-flagged' : ''}`}>{plural(client.days, 'day')}</span></td>
          </tr>)}</tbody>
        </table></div>}
      {onboarding.total > onboarding.clients.length && <small>Showing the {onboarding.clients.length} longest-waiting of {onboarding.total}.</small>}
    </section>

    <div className="two-columns">
      <section className="card">
        <header className="section-heading"><div><h2><ShieldCheck size={20} /> Compliance & risk</h2><p>Your standing and your clients' exposure.</p></div><Link to={`/compliance/${session.user.id}`}>My compliance</Link></header>
        {compliance
          ? <>
            <div className="detail-row"><span>Qualification</span><span className={`badge ${QUALIFICATION_BADGE[compliance.qualificationStatus] || ''}`}>{label(compliance.qualificationStatus)}</span></div>
            <div className="detail-row"><span>CPD</span><span className={`badge ${CPD_BADGE[compliance.cpdStatus] || ''}`}>{label(compliance.cpdStatus)}</span></div>
          </>
          : <p className="empty">Your compliance record hasn't been set up yet.</p>}
        <div className="detail-row"><span>Politically exposed clients<small>Need enhanced due diligence</small></span><b>{clients.politicallyExposed}</b></div>
        <h3 className="dash-subheading">Clients by risk profile</h3>
        <RiskMixChart rows={riskRows(clients.riskMix)} />
      </section>

      <section className="card">
        <header className="section-heading"><div><h2><Bell size={20} /> Latest activity</h2><p>{activity.unread ? `${activity.unread} unread` : "You're all caught up."}</p></div><Link to="/reminders">All notifications</Link></header>
        {!activity.recent.length && <p className="empty">Nothing yet. Registrations and signed documents show up here.</p>}
        {activity.recent.map(item => <div className="detail-row" key={item.id}>
          <span><b style={{ fontWeight: item.read ? 500 : 700 }}>{item.title}</b>{item.body && <small>{item.body}</small>}</span>
          <small>{relativeTime(item.createdAt)}</small>
        </div>)}
      </section>
    </div>
  </div>
}
