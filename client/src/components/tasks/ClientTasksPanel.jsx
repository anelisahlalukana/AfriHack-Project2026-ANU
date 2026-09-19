import { Link } from 'react-router-dom'
import { Inbox, Plus } from 'lucide-react'
import { useTaskList } from '../../hooks/useTasks'
import { formatDateTime, progressText } from '../../lib/taskFormat'
import { StatusChip, WaitingChip } from './TaskBits'

// Shown on the advisor's client profile: this client's claims and requests.
export default function ClientTasksPanel({ clientId }) {
  const { data, loading, error, retry } = useTaskList({ clientId })
  return <section className="card">
    <header className="section-heading">
      <div><h2><Inbox size={20} /> Claims & requests</h2><p>Everything this client has asked for, and where it stands.</p></div>
      <Link className="button" to={`/tasks/new?client=${clientId}`}><Plus size={15} /> Log a request</Link>
    </header>
    {loading && <p role="status">Loading…</p>}
    {error && <div role="alert"><p className="error">{error}</p><button onClick={retry}>Try again</button></div>}
    {data && !data.length && <p>No claims or requests yet.</p>}
    {data?.map(task => <div className="detail-row" key={task.id}>
      <span><Link className="client-name" to={`/tasks/${task.id}`}>{task.reference} · {task.isClaim ? `${task.typeLabel} claim` : task.typeLabel}</Link><small>{task.currentStage?.label || 'Submitted'} · {progressText(task.progress)} · {formatDateTime(task.updatedAt)}</small></span>
      <span className="rs-chips"><StatusChip status={task.status} viewer="staff" /><WaitingChip task={task} /></span>
    </div>)}
  </section>
}
