import { providersFor } from '../../lib/taskFormat'

// Insurer / product provider and policy number. Claims only list providers for that line.
export function ProviderFields({ providers, category, providerId, policyNumber, onChange, required = true }) {
  const options = providersFor(providers, category)
  return <div className="form-grid">
    <label>{category ? 'Your insurer' : 'Product provider'}{required && ' *'}
      <select value={providerId || ''} required={required} onChange={e => onChange({ providerId: e.target.value, policyNumber })}>
        <option value="" disabled>Choose…</option>
        {options.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
      </select>
      <small>Royal Square works with many providers. Each one sees only its own product.</small>
    </label>
    <label>Policy number
      <input value={policyNumber || ''} maxLength={60} onChange={e => onChange({ providerId, policyNumber: e.target.value })} placeholder="If you have it" />
    </label>
  </div>
}
