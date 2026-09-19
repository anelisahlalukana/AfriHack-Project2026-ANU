import { Link } from 'react-router-dom'
import { FilePlus2, ShieldAlert } from 'lucide-react'
import { useTaskList } from '../../hooks/useTasks'
import { formatDateTime, progressText } from '../../lib/taskFormat'
import { ProgressBar, StatusChip, WaitingChip } from '../../components/tasks/TaskBits'

function TaskCard({ task }) {
  const draft = task.status === 'draft'
  const to = draft ? `/account/claims/${task.id}/continue` : `/account/tasks/${task.id}`
  return <article className={`card ${task.status === 'awaiting_client' ? 'rs-needs' : ''}`}>
    <div className="section-heading">
      <div>
        <h3><Link className="client-name" to={to}>{task.isClaim ? `${task.typeLabel} claim` : task.typeLabel}</Link></h3>
        <small>{task.reference}{task.provider ? ` · ${task.provider.name}` : ''}{task.providerReference ? ` · ${task.providerReference}` : ''}</small>
      </div>
      <span className="rs-chips"><StatusChip status={task.status} />{!draft && <WaitingChip task={task} viewer="client" />}</span>
    </div>
    {task.status === 'awaiting_client' && <p><b>{task.currentStage?.clientActionLabel}</b></p>}
    {draft ? <p>You started this claim but have not sent it yet.</p> : <>
      <p>{task.currentStage?.label || 'Submitted'}</p>
      <ProgressBar progress={task.progress} />
    </>}
    <div className="section-heading"><small>Updated {formatDateTime(task.updatedAt)}</small><Link to={to}>{draft ? 'Continue' : task.status === 'awaiting_client' ? 'Do this now' : 'View'}</Link></div>
  </article>
}

export default function MyRequests() {
  const { data, loading, error, retry } = useTaskList({})
  const tasks = (data || []).filter(task => task.status !== 'cancelled')
  const active = tasks.filter(task => !['completed', 'declined'].includes(task.status))
  const done = tasks.filter(task => ['completed', 'declined'].includes(task.status))
  return <>
    <header className="page-heading">
      <div><p className="eyebrow">YOUR CLAIMS & REQUESTS</p><h1>Everything you have asked us for</h1><p>Each update shows who sent it and when.</p></div>
      <div className="rs-row-actions">
        <Link className="button primary" to="/account/claims/new"><ShieldAlert size={16} /> Report an accident or loss</Link>
        <Link className="button" to="/account/requests/new"><FilePlus2 size={16} /> Ask for something</Link>
      </div>
    </header>
    {loading && <p role="status">Loading…</p>}
    {error && <div className="card" role="alert"><p className="error">{error}</p><button onClick={retry}>Try again</button></div>}
    {data && !tasks.length && <div className="card empty"><h3>Nothing here yet</h3><p>Report a claim or ask us to update your details.</p></div>}
    {active.length > 0 && <div className="rs-stack">{active.map(task => <TaskCard key={task.id} task={task} />)}</div>}
    {done.length > 0 && <section className="rs-stack" style={{ marginTop: 28 }}>
      <h2>Closed</h2>
      {done.map(task => <div className="detail-row" key={task.id}><span><Link className="client-name" to={`/account/tasks/${task.id}`}>{task.isClaim ? `${task.typeLabel} claim` : task.typeLabel}</Link><small>{task.reference} · {progressText(task.progress)} · closed {formatDateTime(task.closedAt)}</small></span><StatusChip status={task.status} /></div>)}
    </section>}
  </>
}
