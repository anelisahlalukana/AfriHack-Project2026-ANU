import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { ArrowLeft } from 'lucide-react'
import { useCatalog } from '../../hooks/useTasks'
import { createRequest, uploadTaskFile } from '../../api/tasks'
import { listClients } from '../../api/clients'
import { compactForm, dynamicDefaults } from '../../lib/taskFormat'
import { Alert } from '../../components/tasks/TaskBits'
import { DynamicFields } from '../../components/tasks/DynamicFields'
import { ProviderFields } from '../../components/tasks/ProviderFields'

// Advisors only: choose which client the request is for (e.g. it arrived by email or phone).
function ClientSelect({ register }) {
  const [clients, setClients] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    listClients()
      .then(rows => { if (active) setClients(rows.filter(row => row.first_name)) })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [])
  return <label>Client *
    <select {...register('clientId', { required: true })} required disabled={!clients}>
      <option value="" disabled>{clients ? 'Choose a client…' : 'Loading clients…'}</option>
      {clients?.map(client => <option key={client.id} value={client.id}>{client.first_name} {client.surname}</option>)}
    </select>
    {error && <small className="error">{error}</small>}
  </label>
}

function RequestForm({ type, providers, staff, initialClientId, onBack }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const { register, control, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      clientId: initialClientId || '',
      providerId: '',
      policyNumber: '',
      form: dynamicDefaults(type.form_fields),
    },
  })

  async function submit(values) {
    setError('')
    try {
      let task = await createRequest({
        taskType: type.task_type,
        form: compactForm(values.form),
        clientId: staff ? values.clientId : undefined,
        ...(type.requires_provider ? { providerId: values.providerId, policyNumber: values.policyNumber } : {}),
      })
      // Attach chosen files after the request exists; anything that fails shows as missing on the next screen.
      for (const doc of type.required_documents) {
        const file = values.documents?.[doc.key]?.[0]
        if (!file) continue
        try { task = await uploadTaskFile(task.id, file, { documentKey: doc.key }) } catch { /* retried from the detail page */ }
      }
      navigate(staff ? `/tasks/${task.id}` : `/account/tasks/${task.id}`)
    } catch (error) { setError(error.message) }
  }

  return <form className="rs-stack" onSubmit={handleSubmit(submit)}>
    <fieldset disabled={isSubmitting} className="form-stack">
      <section className="card rs-form">
        <div className="section-heading"><div><h2>{type.label}</h2><p>{type.description}</p></div><button type="button" onClick={onBack}>Change</button></div>
        {staff && <div className="form-grid"><ClientSelect register={register} /></div>}
        {type.requires_provider && <ProviderFields providers={providers} category={null} register={register} />}
        <DynamicFields fields={type.form_fields} register={register} control={control} />
      </section>
      {type.required_documents.length > 0 && <section className="card">
        <h2>Supporting documents</h2>
        {type.required_documents.map(doc => <div className="rs-pack-row" key={doc.key}>
          <label style={{ flex: '1 1 260px' }}>{doc.label}{doc.required ? '' : ' (optional)'}
            <input type="file" accept="image/*,application/pdf" {...register(`documents.${doc.key}`)} />
          </label>
        </div>)}
        <p className="rs-note">Required documents can also be added after you send the request.</p>
      </section>}
      <Alert>{error}</Alert>
      <div className="form-actions"><button className="primary">{isSubmitting ? 'Sending…' : 'Send request'}</button></div>
    </fieldset>
  </form>
}

export default function NewRequest({ staff = false }) {
  const catalog = useCatalog()
  const [params] = useSearchParams()
  const [typeKey, setTypeKey] = useState(params.get('type') || '')
  const type = catalog.data?.requestTypes.find(t => t.task_type === typeKey)

  return <>
    <Link className="back" to={staff ? '/tasks' : '/account/claims'}><ArrowLeft size={16} /> {staff ? 'Requests & claims' : 'My claims & requests'}</Link>
    <header className="page-heading"><div><p className="eyebrow">{staff ? 'LOG A CLIENT REQUEST' : 'ASK FOR SOMETHING'}</p><h1>{staff ? 'What does the client need?' : 'How can we help?'}</h1><p>{staff ? 'For requests that arrived by email, WhatsApp or phone.' : 'We pass it to your provider and tell you when it is done.'}</p></div></header>
    {catalog.loading && <p role="status">Loading…</p>}
    <Alert>{catalog.error}</Alert>
    {catalog.data && (type
      ? <RequestForm key={type.task_type} type={type} providers={catalog.data.providers} staff={staff} initialClientId={params.get('client')} onBack={() => setTypeKey('')} />
      : <div className="rs-choices">{catalog.data.requestTypes.map(t => <button key={t.task_type} className="rs-choice" onClick={() => setTypeKey(t.task_type)}><b>{t.label}</b><span>{t.description}</span></button>)}</div>)}
  </>
}
