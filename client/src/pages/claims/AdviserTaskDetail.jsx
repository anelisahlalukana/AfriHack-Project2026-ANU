import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Ban, CheckCircle2, RadioTower, Send } from 'lucide-react'
import { useTask } from '../../hooks/useTasks'
import { closeTask, messageProvider, postUpdate } from '../../api/tasks'
import { formatDateTime } from '../../lib/taskFormat'
import { Alert, ProgressBar, StatusChip, WaitingChip } from '../../components/tasks/TaskBits'
import { StageTimeline, UpdateFeed } from '../../components/tasks/StageTimeline'
import { DocumentsPanel } from '../../components/tasks/DocumentsPanel'
import { MessageBox } from '../../components/tasks/MessageBox'
import { SubmittedDetails } from '../../components/tasks/SubmittedDetails'

function StepControls({ task, onChange }) {
  const p = task.permissions
  const [confirming, setConfirming] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  // Every button reads the note and chosen step from this form, so the inputs stay uncontrolled.
  function act(label, request, { confirm = false } = {}) {
    return async event => {
      const form = event.currentTarget.form
      if (confirm && confirming !== label) { setConfirming(label); return }
      const data = new FormData(form)
      const note = data.get('note').trim() || undefined
      setBusy(label); setError('')
      try { onChange(await request({ note, stageKey: data.get('stageKey') || undefined })); form.reset(); setConfirming('') }
      catch (error) { setError(error.message) }
      finally { setBusy('') }
    }
  }

  if (!p.canUpdate) return <section className="card"><h2>Next step</h2><p>This {task.isClaim ? 'claim' : 'request'} is {task.status === 'completed' ? 'complete' : task.status}.{task.closedAt ? ` Closed ${formatDateTime(task.closedAt)}.` : ''}</p></section>

  const next = p.nextStage
  const moveable = task.stages.filter(stage => stage.key !== task.currentStage?.key && !stage.terminal)
  return <form className="card rs-form" onSubmit={event => event.preventDefault()}>
    <h2>Next step</h2>
    {task.status === 'awaiting_client' && <p className="rs-note">Waiting on the client: {task.currentStage?.clientActionLabel}</p>}
    {p.providerStep && <p className="rs-note"><RadioTower size={13} /> Waiting on {task.provider.name}: {p.providerStep.kind === 'update' ? `${p.providerStep.label} (they post updates until it's done)` : p.providerStep.label}. They update this from the provider portal.</p>}
    <label>Note for this step (optional)<textarea name="note" maxLength={2000} disabled={Boolean(busy)} /></label>
    <div className="rs-row-actions">
      {next && next.actor !== 'provider' && !next.terminal && <button type="button" className={task.status === 'awaiting_client' ? '' : 'primary'} disabled={Boolean(busy)} onClick={act('next', ({ note }) => postUpdate(task.id, { stageKey: next.key, note }))}>
        <ArrowRight size={15} /> {busy === 'next' ? 'Saving…' : next.actor === 'client' ? `Ask the client: ${next.label}` : next.label}
      </button>}
    </div>
    <details>
      <summary>Move to a different step</summary>
      <div className="rs-row-actions" style={{ marginTop: 10 }}>
        <select name="stageKey" aria-label="Step" defaultValue="">
          <option value="">Choose a step…</option>
          {moveable.map(stage => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
        </select>
        <button type="button" disabled={Boolean(busy)} onClick={act('move', ({ note, stageKey }) => {
          if (!stageKey) return Promise.reject(new Error('Choose a step to move to'))
          return postUpdate(task.id, { stageKey, note })
        })}>Move</button>
      </div>
    </details>
    <div className="rs-row-actions">
      <button type="button" disabled={Boolean(busy)} onClick={act('close', ({ note }) => closeTask(task.id, { outcome: 'completed', note }), { confirm: true })}>
        <CheckCircle2 size={15} /> {confirming === 'close' ? 'Click again to confirm' : task.isClaim ? 'Finish and ask for review' : 'Close as done'}
      </button>
      <button type="button" className="remove" disabled={Boolean(busy)} onClick={act('decline', ({ note }) => closeTask(task.id, { outcome: 'declined', note }), { confirm: true })}>
        <Ban size={15} /> {confirming === 'decline' ? 'Click again to confirm' : 'Decline'}
      </button>
    </div>
    <Alert>{error}</Alert>
  </form>
}

const EVENT_NAMES = {
  claim_submitted: 'Claim sent', request_submitted: 'Request sent', claim_registered: 'Claim registered',
  request_acknowledged: 'Request acknowledged', progress_update: 'Progress update', handler_changed: 'Claims handler changed',
  declined: 'Declined', message: 'Message',
}

function eventText(event, stages) {
  const p = event.payload || {}
  if (p.claim_number) return `Claim number ${p.claim_number}, handler ${p.claims_handler}`
  if (p.reference) return `Reference ${p.reference}`
  if (p.note) return p.note
  if (p.royal_square_reference) return `${p.royal_square_reference}${p.policy_number ? ` · policy ${p.policy_number}` : ''}`
  return stages.find(stage => stage.key === event.event_type)?.label || ''
}

// Everything exchanged with the insurer, plus a box to message them. They reply
// from the provider portal; the client never sees this card.
function ProviderFeed({ task, onChange }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!task.provider) return null
  const name = task.provider.name

  async function send(event) {
    event.preventDefault()
    const form = event.currentTarget
    const note = new FormData(form).get('note').trim()
    if (!note) { setError(`Write a message to ${name} first`); return }
    setBusy(true); setError('')
    try { onChange(await messageProvider(task.id, { note })); form.reset() }
    catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }

  return <section className="card">
    <header className="section-heading"><div><h2>{name}</h2><p>{name} sees this {task.isClaim ? 'claim' : 'request'} and policy only, not the client's other products or your notes.</p></div><span className="rs-chip ok">Provider portal</span></header>
    {!task.providerEvents.length ? <p className="rs-note">Nothing exchanged yet.</p> : <ul className="rs-events">
      {task.providerEvents.map(event => <li key={event.id}>
        <span className={`rs-chip ${event.direction === 'received' ? 'ok' : ''}`}>{event.direction === 'sent' ? 'Sent' : 'Received'}</span>
        <span><b>{EVENT_NAMES[event.event_type] || task.stages.find(stage => stage.key === event.event_type)?.label || event.event_type}</b>{event.payload?.by ? ` · ${event.payload.by}` : ''} · {formatDateTime(event.created_at)}{eventText(event, task.stages) && <><br />{eventText(event, task.stages)}</>}</span>
      </li>)}
    </ul>}
    {task.permissions.canMessageProvider && <form className="rs-form" onSubmit={send}>
      <label>Message {name}<textarea name="note" maxLength={2000} disabled={busy} placeholder="Quotes attached, please authorise…" /></label>
      <div className="rs-row-actions"><button disabled={busy}><Send size={15} /> {busy ? 'Sending…' : `Send to ${name}`}</button></div>
      <Alert>{error}</Alert>
    </form>}
  </section>
}

export default function AdviserTaskDetail() {
  const { taskId } = useParams()
  const { data: task, loading, error, retry, replace } = useTask(taskId)
  if (loading) return <p role="status">Loading…</p>
  if (error) return <div className="card" role="alert"><p className="error">{error}</p><button onClick={retry}>Try again</button><Link to="/tasks">Back to the queue</Link></div>

  return <>
    <Link className="back" to="/tasks"><ArrowLeft size={16} /> Requests & claims</Link>
    <header className="page-heading">
      <div>
        <h1>{task.isClaim ? `${task.typeLabel} claim` : task.typeLabel}</h1>
        <p>{task.reference}{task.providerReference ? ` · ${task.provider?.name} ${task.providerReference}` : ''}</p>
        <p><Link className="client-name" to={`/clients/${task.client.id}`}>{task.client.name}</Link> · submitted {formatDateTime(task.submittedAt)}</p>
        <p className="rs-chips"><StatusChip status={task.status} viewer="staff" /><WaitingChip task={task} />{task.claimsHandler && <span className="rs-chip">Handler: {task.claimsHandler}</span>}</p>
      </div>
    </header>
    <div className="rs-detail">
      <div className="rs-stack">
        <StepControls task={task} onChange={replace} />
        <section className="card"><h2>Progress</h2><ProgressBar progress={task.progress} /><StageTimeline task={task} viewer="staff" /></section>
        <section className="card"><h2>Messages and audit trail</h2><MessageBox task={task} onChange={replace} staff /><UpdateFeed updates={task.updates} stages={task.stages} viewer="staff" /></section>
      </div>
      <div className="rs-stack">
        <SubmittedDetails task={task} />
        <DocumentsPanel task={task} onChange={replace} canUpload={task.permissions.canUpdate} />
        <ProviderFeed task={task} onChange={replace} />
      </div>
    </div>
  </>
}
