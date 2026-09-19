import { useFieldArray } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'

const FINANCIAL_CATEGORIES = [['asset', 'Asset'], ['liability', 'Liability'], ['income', 'Income'], ['expense', 'Expense']]

function FinancialItems({ field, name, register, control }) {
  const { fields, append, remove } = useFieldArray({ control, name })
  return <fieldset className="rs-items rs-wide form-stack">
    <legend><b>{field.label}</b>{field.required && ' *'}</legend>
    {field.hint && <small>{field.hint}</small>}
    {fields.map((row, index) => <div className="rs-item-row" key={row.id}>
      <label>Type<select {...register(`${name}.${index}.category`, { required: true })}>
        {FINANCIAL_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Description<input {...register(`${name}.${index}.item_type`, { required: true })} placeholder="e.g. Unit trust, home loan, salary" required /></label>
      <label>Amount (ZAR)<input type="number" min="0" step="0.01" {...register(`${name}.${index}.amount`, { required: true })} required /></label>
      <button type="button" className="remove" onClick={() => remove(index)} aria-label={`Remove row ${index + 1}`}><Trash2 size={15} /></button>
    </div>)}
    <div><button type="button" onClick={() => append({ category: 'asset', item_type: '', amount: '' })}><Plus size={15} /> Add a row</button></div>
  </fieldset>
}

// Renders the form_fields config of a claim category or request type into a react-hook-form form.
// Values live under `prefix` (e.g. form.incident_at) so they don't clash with the form's other fields.
export function DynamicFields({ fields = [], register, control, prefix = 'form' }) {
  return <div className="form-grid">
    {fields.map(field => {
      const name = `${prefix}.${field.key}`
      if (field.type === 'financial_items') return <FinancialItems key={field.key} field={field} name={name} register={register} control={control} />
      if (field.type === 'boolean') {
        return <label key={field.key} className="checkbox rs-wide"><input type="checkbox" {...register(name)} />{field.label}</label>
      }
      const registration = register(name, { required: Boolean(field.required) })
      let input
      if (field.type === 'textarea') input = <textarea {...registration} required={Boolean(field.required)} />
      else if (field.type === 'select') {
        input = <select {...registration} required={Boolean(field.required)}>
          <option value="" disabled>Choose…</option>
          {(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      } else {
        const type = { date: 'date', datetime: 'datetime-local', number: 'number', tel: 'tel' }[field.type] || 'text'
        input = <input {...registration} type={type} required={Boolean(field.required)} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} />
      }
      return <label key={field.key} className={field.type === 'textarea' ? 'rs-wide' : ''}>
        <span>{field.label}{field.required && ' *'}</span>
        {input}
        {field.hint && <small>{field.hint}</small>}
      </label>
    })}
  </div>
}
