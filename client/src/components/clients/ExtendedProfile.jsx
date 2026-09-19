import { useState } from 'react'
import { useForm, useFieldArray, useWatch, useFormState } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { profileSections } from '../../constants/profileSections'
import { profileDefaults, profilePayload, getValue, validateProfileField } from '../../lib/extendedProfile'
import { saveProfileDetails } from '../../api/clients'

function ProfileField({ field, register, control, readOnly = false }) {
  const { errors } = useFormState({ control, name: field.path })
  const error = getValue(errors, field.path)
  const errorId = `${field.path}-error`
  const inputProps = {
    ...register(field.path, { validate: value => validateProfileField(value, field) }),
    required: field.required,
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? errorId : undefined,
  }
  return <label>{field.label}{field.required ? ' (required)' : ' (optional)'}
    {field.options ? <select {...inputProps}>
      <option value="">Select relationship</option>
      {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select> : <input {...inputProps} type={field.type || 'text'} readOnly={readOnly}
      min={field.type === 'number' ? 0 : undefined}
      max={field.path.includes('workAllocation') || field.path.endsWith('beneficiary_percentage') ? 100 : undefined}
      step={field.type === 'number' ? 'any' : undefined} maxLength={2000} />}
    {error && <span id={errorId} className="error" role="alert">{error.message}</span>}
  </label>
}

function PlanningGoals({ control, register, name, title }) {
  const { fields, append, remove } = useFieldArray({ control, name })
  return <section className="card"><h3>{title}</h3>{fields.map((row,index) => <div className="section-heading" key={row.id}><ProfileField field={{ path: `${name}.${index}.text`, label: `Goal ${index + 1}`, required: true }} register={register} control={control} /><button type="button" aria-label={`Remove ${title} goal ${index+1}`} onClick={() => remove(index)}><Trash2 size={16} /></button></div>)}<button type="button" onClick={() => append({ text: '' })}><Plus size={16} /> Add goal</button></section>
}
export default function ExtendedProfile({ client, onSaved }) {
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const { control, register, handleSubmit, reset, formState: { isSubmitting } } = useForm({ defaultValues: profileDefaults(client), shouldUnregister: false, mode: 'onBlur' })
  // Retain saved marriage details when the relationship selector hides that field.
  const relationship = useWatch({ control, name: 'spouseOrParent.relationship' })
  const dependants = useFieldArray({ control, name: 'dependantsBeneficiaries' })
  async function submit(values) {
    setError(''); setSaved(false)
    try { const updated = await saveProfileDetails(client.id, profilePayload(values)); reset(profileDefaults(updated)); setSaved(true); onSaved?.(updated) }
    catch (error) { setError(error.message) }
  }
  return <form noValidate onSubmit={handleSubmit(submit)} onChange={() => setSaved(false)}><fieldset disabled={isSubmitting} className="form-stack">
    <header><h2>Complete client profile</h2><p>Personal, family, employment and planning details. First name and surname are required. Each dependant you add needs a full name, and each goal you add needs a description. All other fields are optional. Required fields are labelled; remove unused dependant or goal rows.</p></header>
    {profileSections.map(section => <section className="card" key={section.title}><h3>{section.title}</h3>{section.description && <p>{section.description}</p>}<div className="form-grid">{section.fields.filter(field => !field.relationships || field.relationships.includes(relationship)).map(field => <ProfileField key={field.path} field={{ ...field, required: ['first_name', 'surname'].includes(field.column) }} register={register} control={control} readOnly={field.column === 'id_number' && Boolean(client.auth_user_id)} />)}</div></section>)}
    <section className="card"><h3>Dependants & beneficiaries</h3><p>These are the existing dependants used in your financial needs analysis.</p>{dependants.fields.map((row,index) => <div className="repeat-row" key={row.id}><div className="form-grid">{[['full_name','Full name','text'],['relationship','Relationship','text'],['date_of_birth','Date of birth','date'],['id_number','ID / passport','text'],['beneficiary_percentage','Beneficiary allocation (%)','number']].map(([key,label,type]) => <ProfileField key={key} field={{ path: `dependantsBeneficiaries.${index}.${key}`, label, type, required: key === 'full_name' }} register={register} control={control} />)}</div><button type="button" onClick={() => dependants.remove(index)}>Remove dependant</button></div>)}<button type="button" onClick={() => dependants.append({ full_name:'', relationship:'', date_of_birth:'', id_number:'', beneficiary_percentage:'' })}><Plus size={16} /> Add dependant</button></section>
    <p>Planning goals below are separate from your existing financial goals with target amounts and progress.</p>
    <PlanningGoals control={control} register={register} name="planningGoals.immediate" title="Immediate goals" />
    <PlanningGoals control={control} register={register} name="planningGoals.longTerm" title="Long-term goals" />
    {error && <p role="alert" className="error">{error}</p>}{saved && <p role="status" className="auth-notice">Profile saved.</p>}
    <button className="primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save complete profile'}</button>
  </fieldset></form>
}
