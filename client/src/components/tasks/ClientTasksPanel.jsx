import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Inbox, Link2, Plus } from 'lucide-react'
import { useTaskList } from '../../hooks/useTasks'
import { getAccountLink, linkAccount, unlinkAccount } from '../../api/tasks'
import { errorMessage, formatDateTime, progressText } from '../../lib/taskFormat'
import { Alert, StatusChip, WaitingChip } from './TaskBits'
import '../../styles/claims.css'

function AccountLink({ clientId }) {
  const [state, setState] = useState(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(action) {
    setBusy(true); setError('')
    try { setState(await action()); setEmail('') }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  if (!state) {
    return <div className="rs-row-actions"><button type="button" onClick={() => run(() => getAccountLink(clientId))} disabled={busy}><Link2 size={15} /> {busy ? 'Checking…' : 'Client login'}</button><Alert>{error}</Alert></div>
  }
  return <div className="rs-form">
    {state.linked
      ? <p>Linked to <b>{state.linkedEmail}</b>. The client can report claims and track requests.</p>
      : <p>Not linked. The client signs up at /signup, then you link their email here.</p>}
    <form className="rs-row-actions" onSubmit={e => { e.preventDefault(); run(() => linkAccount(clientId, email)) }}>
      <label style={{ flex: 1 }}>Client login email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <button className="primary" disabled={busy}>{state.linked ? 'Relink' : 'Link login'}</button>
      {state.linked && <button type="button" onClick={() => run(() => unlinkAccount(clientId))} disabled={busy}>Unlink</button>}
    </form>
    <Alert>{error}</Alert>
  </div>
}

// Shown on the adviser's client profile.
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
    <AccountLink clientId={clientId} />
  </section>
}
