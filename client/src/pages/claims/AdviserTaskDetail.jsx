import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Ban, CheckCircle2, RadioTower } from 'lucide-react'
import { useTask } from '../../hooks/useTasks'
import { closeTask, postUpdate, simulateProviderEvent } from '../../api/tasks'
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
  const provider = task.provider?.name || 'the provider'

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
    <label>Note for this step (optional)<textarea name="note" maxLength={2000} disabled={Boolean(busy)} /></label>
    <div className="rs-row-actions">
      {next && next.actor !== 'provider' && !next.terminal && <button type="button" className={task.status === 'awaiting_client' ? '' : 'primary'} disabled={Boolean(busy)} onClick={act('next', ({ note }) => postUpdate(task.id, { stageKey: next.key, note }))}>
        <ArrowRight size={15} /> {busy === 'next' ? 'Saving…' : next.actor === 'client' ? `Ask the client: ${next.label}` : next.label}
      </button>}
      {p.canSimulateProvider && <button type="button" disabled={Boolean(busy)} onClick={act('provider', ({ note }) => simulateProviderEvent(task.id, { note }))}>
        <RadioTower size={15} /> {busy === 'provider' ? 'Waiting…' : `Simulate ${provider} update`}
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
      {task.provider && <button type="button" className="remove" disabled={Boolean(busy)} onClick={act('provider-decline', ({ note }) => simulateProviderEvent(task.id, { decline: true, note }), { confirm: true })}>
        {confirming === 'provider-decline' ? 'Click again to confirm' : `Simulate ${provider} declining`}
      </button>}
    </div>
    <Alert>{error}</Alert>
  </form>
}

function ProviderFeed({ task }) {
  if (!task.provider) return null
  return <section className="card">
    <header className="section-heading"><div><h2>{task.provider.name} feed</h2><p>{task.provider.name} sees this {task.isClaim ? 'claim' : 'request'} and policy only, not the client's other products.</p></div><span className="rs-chip ok">Mock integration</span></header>
    {!task.providerEvents.length ? <p className="rs-note">Nothing exchanged yet.</p> : <ul className="rs-events">
      {task.providerEvents.map(event => <li key={event.id}><span className={`rs-chip ${event.direction === 'received' ? 'ok' : ''}`}>{event.direction === 'sent' ? 'Sent' : 'Received'}</span><span><b>{event.event_type?.replaceAll('_', ' ')}</b> · {formatDateTime(event.created_at)}<br /><code>{JSON.stringify(event.payload)}</code></span></li>)}
    </ul>}
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
        <p className="eyebrow">{task.reference}{task.providerReference ? ` · ${task.provider?.name} ${task.providerReference}` : ''}</p>
        <h1>{task.isClaim ? `${task.typeLabel} claim` : task.typeLabel}</h1>
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
        <ProviderFeed task={task} />
      </div>
    </div>
  </>
}
