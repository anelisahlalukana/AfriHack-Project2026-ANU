import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { ArrowLeft } from 'lucide-react'
import { useCatalog, useTask } from '../../hooks/useTasks'
import { cancelDraft, submitClaim, updateDraft } from '../../api/tasks'
import { compactForm, dynamicDefaults } from '../../lib/taskFormat'
import { Alert } from '../../components/tasks/TaskBits'
import { SafetyBanner, SceneChecklist } from '../../components/tasks/SceneChecklist'
import { DynamicFields } from '../../components/tasks/DynamicFields'
import { ProviderFields } from '../../components/tasks/ProviderFields'
import { DocumentsPanel } from '../../components/tasks/DocumentsPanel'

function Stepper({ step, hasChecklist }) {
  const steps = [hasChecklist && ['checklist', 'At the scene'], ['details', 'Claim details'], ['tracking', 'Tracking']].filter(Boolean)
  return <p className="rs-stepper">{steps.map(([key, label], i) => <span key={key} aria-current={key === step ? 'step' : undefined}>{i + 1}. {label}</span>)}</p>
}

function DraftEditor({ task, providers, onTaskChange }) {
  const navigate = useNavigate()
  const hasChecklist = task.config.sceneChecklist.length > 0
  const [step, setStep] = useState(hasChecklist && !Object.keys(task.checklist).length ? 'checklist' : 'details')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const { register, control, handleSubmit, getValues, setValue } = useForm({
    defaultValues: {
      checklist: Object.fromEntries(task.config.sceneChecklist.map(item => [item.key, { done: Boolean(task.checklist[item.key]?.done), note: task.checklist[item.key]?.note || '' }])),
      form: dynamicDefaults(task.config.formFields, task.draftForm),
      providerId: task.provider?.id || '',
      policyNumber: task.policyNumber || '',
    },
  })

  async function run(label, action) {
    setBusy(label); setError('')
    try { await action() } catch (error) { setError(error.message) } finally { setBusy('') }
  }
  const draftBody = () => {
    const { checklist, form, providerId, policyNumber } = getValues()
    return { checklist, form, policyNumber, ...(providerId ? { providerId } : {}) }
  }
  const saveChecklist = () => run('checklist', async () => { onTaskChange(await updateDraft(task.id, { checklist: getValues('checklist') })); setStep('details') })
  const saveForLater = () => run('save', async () => { onTaskChange(await updateDraft(task.id, draftBody())) })
  const discard = () => run('discard', async () => { await cancelDraft(task.id); navigate('/account/claims') })
  // Enter in a checklist note submits the form: treat it as "save and continue", never as the claim submission.
  const submit = values => step === 'checklist' ? saveChecklist() : run('submit', async () => {
    const submitted = await submitClaim(task.id, { form: compactForm(values.form), providerId: values.providerId, policyNumber: values.policyNumber })
    navigate(`/account/tasks/${submitted.id}`)
  })

  return <>
    <Link className="back" to="/account/claims"><ArrowLeft size={16} /> My claims & requests</Link>
    <header className="page-heading"><div><h1>{step === 'checklist' ? 'At the scene' : 'Tell us what happened'}</h1><p>{task.typeLabel} claim · {task.reference}</p><Stepper step={step} hasChecklist={hasChecklist} /></div></header>

    <form className="rs-stack" onSubmit={handleSubmit(submit)}>
      {step === 'checklist' ? <>
        {task.config.safetyBanner && <SafetyBanner />}
        <section className="card">
          <SceneChecklist task={task} items={task.config.sceneChecklist} register={register} control={control} setValue={setValue} onTaskChange={onTaskChange} />
          <div className="form-actions"><button type="button" className="primary" onClick={saveChecklist} disabled={Boolean(busy)}>{busy === 'checklist' ? 'Saving…' : 'Save and continue to your claim'}</button></div>
        </section>
      </> : <>
        <section className="card rs-form"><h2>Your policy</h2><ProviderFields providers={providers} category={task.claimCategory} register={register} /></section>
        <section className="card rs-form"><h2>What happened</h2><DynamicFields fields={task.config.formFields} register={register} control={control} /></section>
        <DocumentsPanel task={task} onChange={onTaskChange} />
        <div className="form-actions">
          <button type="button" onClick={discard} disabled={Boolean(busy)}>{busy === 'discard' ? 'Discarding…' : 'Discard'}</button>
          {hasChecklist && <button type="button" onClick={() => setStep('checklist')}>Back to the checklist</button>}
          <button type="button" onClick={saveForLater} disabled={Boolean(busy)}>{busy === 'save' ? 'Saving…' : 'Save for later'}</button>
          <button className="primary" disabled={Boolean(busy)}>{busy === 'submit' ? 'Sending to your insurer…' : 'Submit claim'}</button>
        </div>
      </>}
      <Alert>{error}</Alert>
    </form>
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

// Claims are started from the "Log a claim" dropdown on the claims page; this route only continues a draft.
export default function ReportClaim() {
  const { taskId } = useParams()
  return taskId ? <ContinueClaim key={taskId} taskId={taskId} /> : <Navigate to="/account/claims" replace />
}
