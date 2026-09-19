import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { CheckCircle2, Hourglass, Inbox, MessageSquare } from 'lucide-react'
import { useProviderTasks } from '../../hooks/useProvider'
import { formatDateTime, progressText, waitingLabel } from '../../lib/taskFormat'
import { StatusChip } from '../../components/tasks/TaskBits'

const TABS = [
  ['action', 'Needs your action'],
  ['waiting', 'With the client or Royal Square'],
  ['closed', 'Closed'],
  ['all', 'All'],
]

function NextUp({ task }) {
  if (task.action) {
    return <span className="rs-chip red">{task.action.kind === 'update' ? `Post an update: ${task.action.label}` : `Your step: ${task.action.label}`}</span>
  }
  if (task.waitingOn) return <span className="rs-chip">{waitingLabel(task.waitingOn, null, 'provider')}</span>
  return null
}

// Insurer inbox: every claim and request Royal Square sent to this provider.
export default function ProviderInbox() {
  const { me } = useOutletContext()
  const [view, setView] = useState('action')
  const [kind, setKind] = useState('')
  const [query, setQuery] = useState('')
  const { data, loading, error, retry } = useProviderTasks({ view, kind })

  const counts = data?.counts
  const visible = (data?.tasks || []).filter(t => !query || [t.reference, t.providerReference, t.client?.name, t.policyNumber, t.claimsHandler]
    .filter(Boolean).some(v => v.toLowerCase().includes(query.toLowerCase())))

  return <>
    <header className="page-heading">
      <div>
        <p className="eyebrow">{me.provider.name.toUpperCase()} · PROVIDER PORTAL</p>
        <h1>Claims & requests</h1>
        <p>Sent to {me.provider.name} by Royal Square Financial. Red outline means it's waiting on you.</p>
      </div>
    </header>
    <div className="stats">
      <article className={`card ${counts?.action ? 'rs-needs' : ''}`}><Inbox /><span>Needs your action</span><strong>{counts ? counts.action : '–'}</strong></article>
      <article className="card"><Hourglass /><span>With the client or Royal Square</span><strong>{counts ? counts.waiting : '–'}</strong></article>
      <article className="card"><CheckCircle2 /><span>Closed</span><strong>{counts ? counts.closed : '–'}</strong></article>
    </div>
    <section className="card">
      <div className="rs-tabs" role="tablist" aria-label="Inbox views">
        {TABS.map(([key, label]) => <button key={key} role="tab" className="rs-tab" aria-selected={view === key} onClick={() => setView(key)}>
          {label}{counts && key !== 'all' ? ` (${counts[key]})` : ''}
        </button>)}
      </div>
      <div className="rs-filters">
        <label>Type<select value={kind} onChange={e => setKind(e.target.value)}>
          <option value="">Claims and requests</option><option value="claims">Claims only</option><option value="requests">Requests only</option>
        </select></label>
        <label className="search">Search<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Claim number, policyholder, policy…" /></label>
      </div>
      {loading && <p role="status">Loading…</p>}
      {error && <div role="alert"><p className="error">{error}</p><button onClick={retry}>Try again</button></div>}
      {data && !visible.length && <div className="empty"><Inbox size={32} /><p>{data.tasks.length ? 'Nothing matches your search.' : view === 'action' ? 'Nothing is waiting on you.' : 'Nothing here yet.'}</p></div>}
      {visible.length > 0 && <div className="table-scroll"><table className="rs-queue">
        <thead><tr><th>Your reference</th><th>Policyholder</th><th>Type</th><th>Current step</th><th>Next</th><th>Updated</th></tr></thead>
        <tbody>{visible.map(t => <tr key={t.id} className={t.action || t.newMessage ? 'waiting-us' : ''}>
          <td><Link className="rs-ref" to={`/provider/tasks/${t.id}`}>{t.providerReference || t.reference}</Link><small>Royal Square {t.reference}</small></td>
          <td>{t.client?.name}<small>{t.policyNumber ? `Policy ${t.policyNumber}` : 'No policy number given'}</small></td>
          <td>{t.isClaim ? `${t.typeLabel} claim` : t.typeLabel}<small>{t.claimsHandler ? `Handler: ${t.claimsHandler}` : ''}</small></td>
          <td>{t.currentStage?.label || 'Submitted'}<small>{progressText(t.progress)}</small></td>
          <td><span className="rs-chips">
            {['completed', 'declined', 'cancelled'].includes(t.status) ? <StatusChip status={t.status} viewer="staff" /> : <NextUp task={t} />}
            {t.newMessage && <span className="rs-chip red"><MessageSquare size={12} /> New message</span>}
          </span></td>
          <td>{formatDateTime(t.updatedAt)}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>
}
