import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { saveClient } from '../api/clients'

const profileFields = ['first_name', 'second_name', 'surname', 'id_number', 'date_of_birth', 'nationality', 'marital_status', 'occupation', 'employer_name', 'annual_income', 'is_politically_exposed', 'pep_details', 'risk_profile_score', 'risk_profile_category', 'contact_email', 'contact_mobile', 'physical_address', 'status']
function Field({ register, errors, name, label, type = 'text', required = false, options, ...props }) {
  const error = name.split('.').reduce((object, part) => object?.[part], errors)
  const registration = register(name, { required: required ? `${label} is required` : false, validate: value => type !== 'text' || !required || Boolean(value?.trim()) || `${label} is required` })
  return <label>{label}{required && ' *'}{options ? <select {...registration} aria-invalid={Boolean(error)} {...props}>{!required && <option value="">Select…</option>}{options.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select> : <input {...registration} type={type} required={required} aria-invalid={Boolean(error)} {...props} />}{error && <small className="error">{error.message}</small>}</label>
}
function RepeatingSection({ title, description, fields, append, remove, defaults, children, disabled }) {
  return <section className="card"><header className="section-heading"><div><h2>{title}</h2><p>{description}</p></div><button type="button" disabled={disabled} onClick={() => append(defaults)}><Plus size={16} /> Add {title === 'Dependants' ? 'dependant' : title === 'Financial items' ? 'item' : 'goal'}</button></header>{!fields.length && <p className="muted">None added yet.</p>}{fields.map((field, index) => <div className="repeat-row" key={field.id}><div className="form-grid">{children(index)}</div><button type="button" className="remove" disabled={disabled} aria-label={`Remove ${title.toLowerCase()} row ${index + 1}`} onClick={() => remove(index)}><Trash2 size={16} /> Remove</button></div>)}</section>
}
function Editor({ client }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const { register, control, handleSubmit, formState: { errors, isSubmitting } } = useForm({ defaultValues: {
    ...Object.fromEntries(profileFields.map(key => [key, client[key] ?? ''])),
    dependants: client.client_dependants,
    items: client.client_financial_items,
    goals: client.client_goals,
  } })
  const politicallyExposed = useWatch({ control, name: 'is_politically_exposed' })
  const dependants = useFieldArray({ control, name: 'dependants' })
  const items = useFieldArray({ control, name: 'items' })
  const goals = useFieldArray({ control, name: 'goals' })
  const field = props => <Field register={register} errors={errors} {...props} />
  async function submit(values) {
    setError('')
    if (values.dependants.reduce((sum, person) => sum + Number(person.beneficiary_percentage || 0), 0) > 100) {
      setError('Combined dependant beneficiary allocations cannot exceed 100%.'); return
    }
    const clean = object => Object.fromEntries(Object.entries(object).map(([key, value]) => [key, typeof value === 'string' ? value.trim() || null : value]))
    const profile = clean(Object.fromEntries(profileFields.map(key => [key, values[key] ?? null])))
    if (!profile.is_politically_exposed) profile.pep_details = null
    try {
      const id = await saveClient(client.id, profile, values.dependants.map(clean), values.items.map(clean), values.goals.map(clean))
      navigate(`/clients/${id}`, { replace: true })
    } catch (error) { setError(`Could not save the client. Your changes are still here. ${error.message}`) }
  }
  return <><Link className="back" to={`/clients/${client.id}`}><ArrowLeft size={16} /> Back to profile</Link><header className="page-heading"><div><p className="eyebrow">FINANCIAL NEEDS ANALYSIS</p><h1>Edit client profile</h1><p>Capture the essentials, understand their needs, and set a direction. * Required fields.</p></div></header>
    <form onSubmit={handleSubmit(submit)}><fieldset disabled={isSubmitting} className="form-stack">
      <section className="card"><h2>Personal information</h2><div className="form-grid">
        {field({ name: 'first_name', label: 'First name', required: true })}{field({ name: 'second_name', label: 'Second name' })}{field({ name: 'surname', label: 'Surname', required: true })}
        {field({ name: 'id_number', label: 'ID / passport number' })}{field({ name: 'date_of_birth', label: 'Date of birth', type: 'date', max: new Date().toLocaleDateString('en-CA') })}{field({ name: 'nationality', label: 'Nationality' })}
        {field({ name: 'marital_status', label: 'Marital status', options: ['single', 'married', 'divorced', 'widowed', 'life_partner', 'other'] })}{field({ name: 'contact_email', label: 'Email address', type: 'email' })}{field({ name: 'contact_mobile', label: 'Mobile number', type: 'tel' })}
        {field({ name: 'physical_address', label: 'Physical address' })}{field({ name: 'status', label: 'Client status', required: true, options: ['onboarding', 'active', 'inactive'] })}
      </div></section>
      <section className="card"><h2>Employment & risk profile</h2><div className="form-grid">{field({ name: 'occupation', label: 'Occupation' })}{field({ name: 'employer_name', label: 'Employer' })}{field({ name: 'annual_income', label: 'Annual income (ZAR)', type: 'number', min: 0, step: '0.01' })}{field({ name: 'risk_profile_score', label: 'Risk assessment score', type: 'number', min: 0, step: 1 })}{field({ name: 'risk_profile_category', label: 'Risk profile category', options: ['conservative', 'moderate', 'balanced', 'growth', 'aggressive'] })}</div><label className="checkbox"><input type="checkbox" {...register('is_politically_exposed')} /> Politically exposed person</label>{politicallyExposed && field({ name: 'pep_details', label: 'Political exposure details', required: true })}</section>
      <RepeatingSection title="Dependants" description="Family members and beneficiary allocations. Total allocation may be up to 100%." {...dependants} defaults={{ full_name: '', relationship: '', date_of_birth: '', id_number: '', beneficiary_percentage: '' }}>
        {index => <>{field({ name: `dependants.${index}.full_name`, label: 'Full name', required: true })}{field({ name: `dependants.${index}.relationship`, label: 'Relationship' })}{field({ name: `dependants.${index}.date_of_birth`, label: 'Date of birth', type: 'date', max: new Date().toLocaleDateString('en-CA') })}{field({ name: `dependants.${index}.id_number`, label: 'ID / passport number' })}{field({ name: `dependants.${index}.beneficiary_percentage`, label: 'Beneficiary allocation (%)', type: 'number', min: 0, max: 100, step: '0.01' })}</>}
      </RepeatingSection>
      <RepeatingSection title="Financial items" description="Record assets and outstanding liabilities for net worth. Income and expenses are recorded separately and excluded from net worth. All amounts in ZAR." {...items} defaults={{ category: 'asset', item_type: '', description: '', amount: '', frequency: '', interest_rate: '' }}>
        {index => <>{field({ name: `items.${index}.category`, label: 'Category', required: true, options: ['asset', 'liability', 'income', 'expense'] })}{field({ name: `items.${index}.item_type`, label: 'Type (e.g. property, mortgage)', required: true })}{field({ name: `items.${index}.description`, label: 'Description' })}{field({ name: `items.${index}.amount`, label: 'Amount (ZAR)', type: 'number', min: 0, step: '0.01', required: true })}{field({ name: `items.${index}.frequency`, label: 'Frequency', options: ['once_off', 'weekly', 'monthly', 'quarterly', 'annually'] })}{field({ name: `items.${index}.interest_rate`, label: 'Interest rate (%)', type: 'number', min: 0, max: 100, step: '0.01' })}</>}
      </RepeatingSection>
      <RepeatingSection title="Goals" description="Set a target and record the amount already saved. All amounts in ZAR." {...goals} defaults={{ goal_name: '', goal_type: '', target_amount: '', target_date: '', current_progress: 0, status: 'in_progress' }}>
        {index => <>{field({ name: `goals.${index}.goal_name`, label: 'Goal name', required: true })}{field({ name: `goals.${index}.goal_type`, label: 'Goal type', options: ['retirement', 'education', 'home', 'emergency_fund', 'other'] })}{field({ name: `goals.${index}.target_amount`, label: 'Target amount (ZAR)', type: 'number', min: '0.01', step: '0.01', required: true })}{field({ name: `goals.${index}.target_date`, label: 'Target date', type: 'date' })}{field({ name: `goals.${index}.current_progress`, label: 'Amount saved (ZAR)', type: 'number', min: 0, step: '0.01', required: true })}{field({ name: `goals.${index}.status`, label: 'Goal status', required: true, options: ['in_progress', 'completed', 'on_hold'] })}</>}
      </RepeatingSection>
      {error && <p className="error card" role="alert">{error}</p>}<footer className="form-actions"><Link className="button" to={`/clients/${client.id}`}>Cancel</Link><button className="primary" disabled={isSubmitting}>{isSubmitting ? 'Saving client…' : 'Save client & financial needs analysis'}</button></footer>
    </fieldset></form></>
}
function ExistingClient({ id }) {
  const { data, loading, error, retry } = useClients(id)
  if (loading) return <p role="status">Loading financial needs analysis…</p>
  if (error) return <div className="card" role="alert"><p className="error">{error}</p><button onClick={retry}>Try again</button><Link to="/">Back to clients</Link></div>
  return <Editor client={data} />
}
// Edits only: new clients are added with AddClient.jsx (route /clients/new).
export default function ClientForm() {
  const { id } = useParams()
  return <ExistingClient key={id} id={id} />
}
