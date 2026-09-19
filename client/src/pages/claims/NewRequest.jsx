import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Paperclip, X } from 'lucide-react'
import { useCatalog } from '../../hooks/useTasks'
import { createRequest, uploadTaskFile } from '../../api/tasks'
import { listClients } from '../../api/clients'
import { errorMessage } from '../../lib/taskFormat'
import { Alert } from '../../components/tasks/TaskBits'
import { DynamicFields } from '../../components/tasks/DynamicFields'
import { ProviderFields } from '../../components/tasks/ProviderFields'
import '../../styles/claims.css'

// Staff only: choose which client the request is for (e.g. it arrived by email or phone).
function ClientSelect({ value, onChange }) {
  const [clients, setClients] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    listClients().then(rows => { if (active) setClients(rows) }).catch(err => { if (active) setError(errorMessage(err)) })
    return () => { active = false }
  }, [])
  return <label>Client *
    <select value={value} onChange={e => onChange(e.target.value)} required disabled={!clients}>
      <option value="" disabled>{clients ? 'Choose a client…' : 'Loading clients…'}</option>
      {clients?.map(client => <option key={client.id} value={client.id}>{client.first_name} {client.surname}</option>)}
    </select>
    {error && <small className="error">{error}</small>}
  </label>
}

function RequestForm({ type, providers, staff, initialClientId, onBack }) {
  const navigate = useNavigate()
  const [clientId, setClientId] = useState(initialClientId || '')
  const [form, setForm] = useState({})
  const [provider, setProvider] = useState({ providerId: '', policyNumber: '' })
  const [pending, setPending] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      let task = await createRequest({
        taskType: type.task_type,
        form,
        clientId: staff ? clientId : undefined,
        ...(type.requires_provider ? provider : {}),
      })
      // Attach chosen files after the request exists; a failed upload can be retried on the detail page.
      for (const [documentKey, file] of Object.entries(pending)) {
        try { task = await uploadTaskFile(task.id, file, { documentKey }) } catch { /* shown as missing on the next screen */ }
      }
      navigate(staff ? `/tasks/${task.id}` : `/account/tasks/${task.id}`)
    } catch (err) { setError(errorMessage(err)); setBusy(false) }
  }

  return <form className="rs-stack" onSubmit={submit}>
    <section className="card rs-form">
      <div className="section-heading"><div><h2>{type.label}</h2><p>{type.description}</p></div><button type="button" onClick={onBack}>Change</button></div>
      {staff && <div className="form-grid"><ClientSelect value={clientId} onChange={setClientId} /></div>}
      {type.requires_provider && <ProviderFields providers={providers} category={null} providerId={provider.providerId} policyNumber={provider.policyNumber} onChange={setProvider} />}
      <DynamicFields fields={type.form_fields} values={form} onChange={setForm} />
    </section>
    {type.required_documents.length > 0 && <section className="card">
      <h2>Supporting documents</h2>
      {type.required_documents.map(doc => <div className="rs-pack-row" key={doc.key}>
        <span>{doc.label}{doc.required ? '' : ' (optional)'}<small>{pending[doc.key]?.name || 'No file chosen'}</small></span>
        {pending[doc.key]
          ? <button type="button" onClick={() => setPending(current => { const next = { ...current }; delete next[doc.key]; return next })}><X size={14} /> Remove</button>
          : <label className="button"><Paperclip size={15} /> Choose file<input className="sr-only" type="file" accept="image/*,application/pdf" onChange={e => { const file = e.target.files?.[0]; if (file) setPending(p => ({ ...p, [doc.key]: file })) }} /></label>}
      </div>)}
      <p className="rs-note">Required documents can also be added after you send the request.</p>
    </section>}
    <Alert>{error}</Alert>
    <div className="form-actions"><button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button></div>
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
