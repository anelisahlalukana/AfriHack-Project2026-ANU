import { Plus, Trash2 } from 'lucide-react'

const FINANCIAL_CATEGORIES = [['asset', 'Asset'], ['liability', 'Liability'], ['income', 'Income'], ['expense', 'Expense']]

function FinancialItems({ field, value = [], onChange }) {
  const rows = Array.isArray(value) ? value : []
  const update = (index, patch) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  return <fieldset className="rs-items rs-wide form-stack">
    <legend><b>{field.label}</b>{field.required && ' *'}</legend>
    {field.hint && <small>{field.hint}</small>}
    {rows.map((row, index) => <div className="rs-item-row" key={index}>
      <label>Type<select value={row.category || ''} onChange={e => update(index, { category: e.target.value })} required>
        <option value="" disabled>Choose</option>
        {FINANCIAL_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Description<input value={row.item_type || ''} onChange={e => update(index, { item_type: e.target.value })} placeholder="e.g. Unit trust, home loan, salary" required /></label>
      <label>Amount (ZAR)<input type="number" min="0" step="0.01" value={row.amount ?? ''} onChange={e => update(index, { amount: e.target.value })} required /></label>
      <button type="button" className="remove" onClick={() => onChange(rows.filter((_, i) => i !== index))} aria-label={`Remove row ${index + 1}`}><Trash2 size={15} /></button>
    </div>)}
    <div><button type="button" onClick={() => onChange([...rows, { category: 'asset', item_type: '', amount: '' }])}><Plus size={15} /> Add a row</button></div>
  </fieldset>
}

// Renders the form_fields config of a claim category or request type.
export function DynamicFields({ fields = [], values, onChange, disabled = false }) {
  const set = (key, value) => onChange({ ...values, [key]: value })
  return <div className="form-grid">
    {fields.map(field => {
      const value = values[field.key]
      const common = { id: `field-${field.key}`, required: Boolean(field.required), disabled }
      if (field.type === 'financial_items') return <FinancialItems key={field.key} field={field} value={value} onChange={v => set(field.key, v)} />
      if (field.type === 'boolean') {
        return <label key={field.key} className="checkbox rs-wide"><input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={e => set(field.key, e.target.checked)} />{field.label}</label>
      }
      let input
      if (field.type === 'textarea') input = <textarea {...common} value={value || ''} onChange={e => set(field.key, e.target.value)} />
      else if (field.type === 'select') {
        input = <select {...common} value={value || ''} onChange={e => set(field.key, e.target.value)}>
          <option value="" disabled>Choose…</option>
          {(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      } else {
        const type = { date: 'date', datetime: 'datetime-local', number: 'number', tel: 'tel' }[field.type] || 'text'
        input = <input {...common} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} value={value ?? ''} onChange={e => set(field.key, e.target.value)} />
      }
      return <label key={field.key} htmlFor={common.id} className={field.type === 'textarea' ? 'rs-wide' : ''}>
        <span>{field.label}{field.required && ' *'}</span>
        {input}
        {field.hint && <small>{field.hint}</small>}
      </label>
    })}
  </div>
}
