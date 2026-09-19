import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useCatalog, useTask } from '../../hooks/useTasks'
import { cancelDraft, createClaim, submitClaim, updateDraft } from '../../api/tasks'
import { errorMessage } from '../../lib/taskFormat'
import { Alert } from '../../components/tasks/TaskBits'
import { SafetyBanner, SceneChecklist } from '../../components/tasks/SceneChecklist'
import { DynamicFields } from '../../components/tasks/DynamicFields'
import { ProviderFields } from '../../components/tasks/ProviderFields'
import { DocumentsPanel } from '../../components/tasks/DocumentsPanel'

function Stepper({ step, hasChecklist }) {
  const steps = [hasChecklist && ['checklist', 'At the scene'], ['details', 'Claim details'], ['tracking', 'Tracking']].filter(Boolean)
  return <p className="rs-stepper">{steps.map(([key, label], i) => <span key={key} aria-current={key === step ? 'step' : undefined}>{i + 1}. {label}</span>)}</p>
}

// Step 1: what kind of claim. Creates a draft straight away so photos can be attached at the scene.
function ChooseCategory() {
  const catalog = useCatalog()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  async function choose(category) {
    setBusy(category); setError('')
    try {
      const task = await createClaim({ category })
      navigate(`/account/claims/${task.id}/continue`)
    } catch (err) { setError(errorMessage(err)); setBusy(null) }
  }
  return <>
    <Link className="back" to="/account/claims"><ArrowLeft size={16} /> My claims & requests</Link>
    <header className="page-heading"><div><p className="eyebrow">REPORT A CLAIM</p><h1>What happened?</h1><p>Choose the type of claim. We will ask only for what that claim needs.</p></div></header>
    {catalog.loading && <p role="status">Loading…</p>}
    <Alert>{catalog.error || error}</Alert>
    <div className="rs-choices">
      {catalog.data?.claimCategories.map(category => <button key={category.category} className="rs-choice" onClick={() => choose(category.category)} disabled={Boolean(busy)} aria-pressed={busy === category.category}>
        <b>{category.label}</b><span>{category.description}</span>
      </button>)}
    </div>
  </>
}

function DraftEditor({ task, providers, onTaskChange }) {
  const navigate = useNavigate()
  const hasChecklist = task.config.sceneChecklist.length > 0
  const [step, setStep] = useState(hasChecklist && !Object.keys(task.checklist).length ? 'checklist' : 'details')
  const [checklist, setChecklist] = useState(task.checklist)
  const [form, setForm] = useState(task.draftForm || {})
  const [provider, setProvider] = useState({ providerId: task.provider?.id || '', policyNumber: task.policyNumber || '' })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function run(label, action) {
    setBusy(label); setError('')
    try { await action() } catch (err) { setError(errorMessage(err)) } finally { setBusy('') }
  }
  const saveChecklist = () => run('checklist', async () => { onTaskChange(await updateDraft(task.id, { checklist })); setStep('details') })
  const saveForLater = () => run('save', async () => { onTaskChange(await updateDraft(task.id, { checklist, form, ...(provider.providerId ? provider : { policyNumber: provider.policyNumber }) })) })
  const discard = () => run('discard', async () => { await cancelDraft(task.id); navigate('/account/claims') })
  const submit = event => {
    event.preventDefault()
    run('submit', async () => {
      const submitted = await submitClaim(task.id, { form, ...provider })
      navigate(`/account/tasks/${submitted.id}`)
    })
  }

  return <>
    <Link className="back" to="/account/claims"><ArrowLeft size={16} /> My claims & requests</Link>
    <header className="page-heading"><div><p className="eyebrow">{task.typeLabel.toUpperCase()} CLAIM · {task.reference}</p><h1>{step === 'checklist' ? 'At the scene' : 'Tell us what happened'}</h1><Stepper step={step} hasChecklist={hasChecklist} /></div></header>

    {step === 'checklist' ? <div className="rs-stack">
      {task.config.safetyBanner && <SafetyBanner />}
      <section className="card">
        <SceneChecklist task={task} items={task.config.sceneChecklist} value={checklist} onChange={setChecklist} onTaskChange={onTaskChange} />
        <div className="form-actions"><button className="primary" onClick={saveChecklist} disabled={Boolean(busy)}>{busy === 'checklist' ? 'Saving…' : 'Save and continue to your claim'}</button></div>
      </section>
    </div> : <form className="rs-stack" onSubmit={submit}>
      <section className="card rs-form"><h2>Your policy</h2><ProviderFields providers={providers} category={task.claimCategory} providerId={provider.providerId} policyNumber={provider.policyNumber} onChange={setProvider} /></section>
      <section className="card rs-form"><h2>What happened</h2><DynamicFields fields={task.config.formFields} values={form} onChange={setForm} /></section>
      <DocumentsPanel task={task} onChange={onTaskChange} />
      <Alert>{error}</Alert>
      <div className="form-actions">
        <button type="button" onClick={discard} disabled={Boolean(busy)}>{busy === 'discard' ? 'Discarding…' : 'Discard'}</button>
        {hasChecklist && <button type="button" onClick={() => setStep('checklist')}>Back to the checklist</button>}
        <button type="button" onClick={saveForLater} disabled={Boolean(busy)}>{busy === 'save' ? 'Saving…' : 'Save for later'}</button>
        <button className="primary" disabled={Boolean(busy)}>{busy === 'submit' ? 'Sending to your insurer…' : 'Submit claim'}</button>
      </div>
    </form>}
    {step === 'checklist' && <Alert>{error}</Alert>}
  </>
}

function ContinueClaim({ taskId }) {
  const task = useTask(taskId)
  const catalog = useCatalog()
  if (task.loading || catalog.loading) return <p role="status">Loading your claim…</p>
  if (task.error || catalog.error) return <div className="card" role="alert"><p className="error">{task.error || catalog.error}</p><button onClick={() => { task.retry(); catalog.retry() }}>Try again</button></div>
  if (task.data.status !== 'draft') return <Navigate to={`/account/tasks/${taskId}`} replace />
  return <DraftEditor key={task.data.id} task={task.data} providers={catalog.data.providers} onTaskChange={task.replace} />
}

export default function ReportClaim() {
  const { taskId } = useParams()
  return taskId ? <ContinueClaim key={taskId} taskId={taskId} /> : <ChooseCategory />
}
