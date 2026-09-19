import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, Hourglass, Inbox, Plus, UserRoundCheck } from 'lucide-react'
import { useCatalog, useTaskList } from '../hooks/useTasks'
import { formatDateTime, progressText } from '../lib/taskFormat'
import { StatusChip, WaitingChip } from '../components/tasks/TaskBits'
import '../styles/claims.css'

const TABS = [
  ['open', 'All open'],
  ['waiting_on_us', 'Waiting on us'],
  ['needs_client', 'Waiting on client'],
  ['overdue', 'Overdue'],
  ['closed', 'Closed'],
]

// Adviser queue: every open claim and request across the adviser's clients, most urgent first.
export default function Tasks() {
  const [tab, setTab] = useState('open')
  const [kind, setKind] = useState('')
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const catalog = useCatalog()
  const { data, loading, error, retry } = useTaskList({ view: tab === 'closed' ? 'closed' : 'open', kind, category })

  const all = data || []
  const counts = {
    open: all.length,
    waiting_on_us: all.filter(t => t.waitingOn === 'us').length,
    needs_client: all.filter(t => t.waitingOn === 'client').length,
    overdue: all.filter(t => t.overdue).length,
  }
  const visible = all
    .filter(t => tab === 'open' || tab === 'closed' || (tab === 'waiting_on_us' ? t.waitingOn === 'us' : tab === 'needs_client' ? t.waitingOn === 'client' : t.overdue))
    .filter(t => !query || [t.reference, t.client?.name, t.title, t.providerReference, t.provider?.name].filter(Boolean).some(v => v.toLowerCase().includes(query.toLowerCase())))

  return <>
    <header className="page-heading">
      <div><p className="eyebrow">OPERATIONS</p><h1>Requests & claims</h1><p>Red outline means the client or insurer is waiting on us.</p></div>
      <Link className="button primary" to="/tasks/new"><Plus size={17} /> Log a request</Link>
    </header>
    {tab !== 'closed' && <div className="stats rs-stats">
      <article className="card"><Inbox /><span>Open</span><strong>{counts.open}</strong></article>
      <article className="card"><Hourglass /><span>Waiting on us</span><strong>{counts.waiting_on_us}</strong></article>
      <article className="card"><UserRoundCheck /><span>Waiting on clients</span><strong>{counts.needs_client}</strong></article>
      <article className={`card ${counts.overdue ? 'rs-needs' : ''}`}><AlarmClock /><span>Overdue (48h+)</span><strong>{counts.overdue}</strong></article>
    </div>}
    <section className="card">
      <div className="rs-tabs" role="tablist" aria-label="Queue views">
        {TABS.map(([key, label]) => <button key={key} role="tab" className="rs-tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}{key !== 'closed' && data && tab !== 'closed' ? ` (${counts[key]})` : ''}</button>)}
      </div>
      <div className="rs-filters">
        <label>Type<select value={kind} onChange={e => { setKind(e.target.value); if (e.target.value === 'requests') setCategory('') }}>
          <option value="">Claims and requests</option><option value="claims">Claims only</option><option value="requests">Requests only</option>
        </select></label>
        {kind !== 'requests' && <label>Claim type<select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All claim types</option>
          {catalog.data?.claimCategories.map(c => <option key={c.category} value={c.category}>{c.label}</option>)}
        </select></label>}
        <label className="search">Search<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Client, reference, insurer…" /></label>
      </div>
      {loading && <p role="status">Loading…</p>}
      {error && <div role="alert"><p className="error">{error}</p><button onClick={retry}>Try again</button></div>}
      {data && !visible.length && <div className="empty"><Inbox size={32} /><p>{all.length ? 'Nothing matches these filters.' : tab === 'closed' ? 'Nothing closed yet.' : 'No open claims or requests.'}</p></div>}
      {visible.length > 0 && <div className="table-scroll"><table className="rs-queue">
        <thead><tr><th>Reference</th><th>Client</th><th>Type</th><th>Current step</th><th>Status</th><th>Updated</th></tr></thead>
        <tbody>{visible.map(t => <tr key={t.id} className={t.waitingOn === 'us' || t.overdue ? 'waiting-us' : ''}>
          <td><Link className="rs-ref" to={`/tasks/${t.id}`}>{t.reference}</Link><small>{t.providerReference || ''}</small></td>
          <td>{t.client?.name}</td>
          <td>{t.isClaim ? `${t.typeLabel} claim` : t.typeLabel}<small>{t.provider?.name || 'Internal'}</small></td>
          <td>{t.currentStage?.label || 'Submitted'}<small>{progressText(t.progress)}</small></td>
          <td><span className="rs-chips"><StatusChip status={t.status} viewer="staff" /><WaitingChip task={t} /></span></td>
          <td>{formatDateTime(t.updatedAt)}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>
}
