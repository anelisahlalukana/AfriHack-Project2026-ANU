import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, CheckCircle2, RefreshCw, Send, UserRoundPen } from 'lucide-react'
import { useProviderTask } from '../../hooks/useProvider'
import {
  changeClaimsHandler,
  declineTask,
  getProviderFileUrl,
  messageRoyalSquare,
  respondToTask,
  uploadProviderFile,
} from '../../api/provider'
import { formatDateTime, waitingLabel } from '../../lib/taskFormat'
import { Alert, ProgressBar, StatusChip } from '../../components/tasks/TaskBits'
import { StageTimeline } from '../../components/tasks/StageTimeline'
import { DocumentsPanel } from '../../components/tasks/DocumentsPanel'
import { SubmittedDetails } from '../../components/tasks/SubmittedDetails'

// Runs a request from a form: reads its fields, reports errors, resets it on success.
function useFormAction(onChange) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  function run(label, request) {
    return async event => {
      const form = event.currentTarget.form || event.currentTarget
      if (event.type === 'submit') event.preventDefault()
      setBusy(label); setError('')
      try { onChange(await request(new FormData(form))); form.reset() }
      catch (error) { setError(error.message) }
      finally { setBusy('') }
    }
  }
  return { busy, error, run }
}

// What the insurer does next: complete its step, post a progress update, or decline.
function ActionCard({ task, onChange }) {
  const { busy, error, run } = useFormAction(onChange)
  const [confirmDecline, setConfirmDecline] = useState(false)
  const p = task.permissions
  const noun = task.isClaim ? 'claim' : 'request'
  const note = data => data.get('note').trim() || undefined

  if (!p.canDecline) {
    return <section className="card"><h2>Your next step</h2><p>This {noun} is {task.status === 'completed' ? 'complete' : task.status}.{task.closedAt ? ` Closed ${formatDateTime(task.closedAt)}.` : ''}</p></section>
  }

  return <form className={`card rs-form ${p.action ? 'rs-needs' : ''}`} onSubmit={event => event.preventDefault()}>
    <h2>Your next step</h2>
    {p.action
      ? <p>{p.action.kind === 'update'
        ? <>This step repeats until it's done: <b>{p.action.label}</b>. Post an update for the client and Royal Square.</>
        : <>Mark this as done when it's complete: <b>{p.action.label}</b>.</>}</p>
      : <p className="rs-note">{waitingLabel(p.waitingOn, null, 'provider') || 'Nothing to do right now'}{task.status === 'awaiting_client' ? `: ${task.currentStage?.clientActionLabel}` : p.nextStep ? `. Next: ${p.nextStep.label}` : ''}. It comes back to your inbox when it's your turn.</p>}
    <label>{p.action ? 'Note (the client and Royal Square see this)' : 'Reason, if you decline'}<textarea name="note" maxLength={2000} disabled={Boolean(busy)} /></label>
    <div className="rs-row-actions">
      {p.action && <button type="button" className="primary" disabled={Boolean(busy)} onClick={run('respond', data => respondToTask(task.id, { note: note(data) }))}>
        {p.action.kind === 'update' ? <RefreshCw size={15} /> : <CheckCircle2 size={15} />} {busy === 'respond' ? 'Saving…' : p.action.kind === 'update' ? 'Post update' : `Done: ${p.action.label}`}
      </button>}
      <button type="button" className="remove" disabled={Boolean(busy)} onClick={event => {
        if (!confirmDecline) { setConfirmDecline(true); return }
        setConfirmDecline(false)
        return run('decline', data => {
          if (!note(data)) return Promise.reject(new Error('Write the reason for declining first. The client and Royal Square will see it.'))
          return declineTask(task.id, { note: note(data) })
        })(event)
      }}>
        <Ban size={15} /> {busy === 'decline' ? 'Declining…' : confirmDecline ? 'Click again to confirm' : `Decline this ${noun}`}
      </button>
    </div>
    <Alert>{error}</Alert>
  </form>
}

// Messages between the insurer and Royal Square. The client never sees these.
function Messages({ task, onChange }) {
  const { busy, error, run } = useFormAction(onChange)
  return <section className="card">
    <header className="section-heading"><div><h2>Messages with Royal Square</h2><p>Only you and the adviser see these, not the client.</p></div></header>
    {!task.messages.length ? <p className="rs-note">No messages yet.</p> : <ul className="rs-feed">
      {[...task.messages].reverse().map(message => <li key={message.id} className={message.fromUs ? 'provider' : ''}>
        <div className="rs-who"><span><b>{message.fromUs ? 'You' : 'Royal Square'}</b>{message.by ? ` · ${message.by}` : ''}</span><span>{formatDateTime(message.createdAt)}</span></div>
        <p>{message.note}</p>
      </li>)}
    </ul>}
    {task.permissions.canMessage && <form className="rs-form" onSubmit={run('message', data => {
      const text = data.get('note').trim()
      if (!text) return Promise.reject(new Error('Write a message first'))
      return messageRoyalSquare(task.id, { note: text })
    })}>
      <label>Message Royal Square<textarea name="note" maxLength={2000} disabled={Boolean(busy)} placeholder="Assessor booked for Tuesday…" /></label>
      <div className="rs-row-actions"><button disabled={Boolean(busy)}><Send size={15} /> {busy ? 'Sending…' : 'Send'}</button></div>
      <Alert>{error}</Alert>
    </form>}
  </section>
}

function HandlerCard({ task, onChange }) {
  const { busy, error, run } = useFormAction(onChange)
  if (!task.isClaim) return null
  return <section className="card">
    <h2>Claims handler</h2>
    <p>{task.claimsHandler ? <>Handled by <b>{task.claimsHandler}</b>.</> : 'No claims handler yet.'}</p>
    {task.permissions.canChangeHandler && <form className="rs-row-actions" onSubmit={run('handler', data => {
      const name = data.get('name').trim()
      if (!name) return Promise.reject(new Error("Enter the new handler's name"))
      return changeClaimsHandler(task.id, name)
    })}>
      <label style={{ flex: '1 1 200px' }}>Reassign to<input name="name" maxLength={120} autoComplete="off" disabled={Boolean(busy)} /></label>
      <button disabled={Boolean(busy)}><UserRoundPen size={15} /> {busy ? 'Saving…' : 'Reassign'}</button>
    </form>}
    <Alert>{error}</Alert>
  </section>
}

function History({ task }) {
  return <section className="card">
    <h2>Exchange log</h2>
    {!task.history.length ? <p className="rs-note">Nothing exchanged yet.</p> : <ul className="rs-events">
      {task.history.map(event => <li key={event.id}>
        <span className={`rs-chip ${event.direction === 'received' ? 'ok' : ''}`}>{event.direction === 'sent' ? 'From RSF' : 'From you'}</span>
        <span><b>{event.label}</b>{event.by ? ` · ${event.by}` : ''} · {formatDateTime(event.createdAt)}{event.note && <><br />{event.note}</>}</span>
      </li>)}
    </ul>}
  </section>
}

export default function ProviderTaskDetail() {
  const { taskId } = useParams()
  const { data: task, loading, error, retry, replace } = useProviderTask(taskId)
  if (loading) return <p role="status">Loading…</p>
  if (error) return <div className="card" role="alert"><p className="error">{error}</p><button onClick={retry}>Try again</button><Link to="/provider">Back to your inbox</Link></div>

  return <>
    <Link className="back" to="/provider"><ArrowLeft size={16} /> Claims & requests</Link>
    <header className="page-heading">
      <div>
        <h1>{task.isClaim ? `${task.typeLabel} claim` : task.typeLabel}</h1>
        <p>{task.providerReference ? `${task.providerReference} · ` : ''}Royal Square {task.reference}</p>
        <p>{task.client?.name}{task.policyNumber ? ` · policy ${task.policyNumber}` : ''} · submitted {formatDateTime(task.submittedAt)}</p>
        <p className="rs-chips"><StatusChip status={task.status} viewer="staff" />{task.newMessage && <span className="rs-chip red">New message from Royal Square</span>}</p>
      </div>
    </header>
    <div className="rs-detail">
      <div className="rs-stack">
        <ActionCard task={task} onChange={replace} />
        <section className="card"><h2>Progress</h2><ProgressBar progress={task.progress} /><StageTimeline task={task} viewer="provider" /></section>
        <Messages task={task} onChange={replace} />
      </div>
      <div className="rs-stack">
        <SubmittedDetails task={task} />
        <HandlerCard task={task} onChange={replace} />
        <DocumentsPanel task={task} onChange={replace} canUpload={task.permissions.canUpload} getFileUrl={getProviderFileUrl} uploadFile={uploadProviderFile} />
        <History task={task} />
      </div>
    </div>
  </>
}
