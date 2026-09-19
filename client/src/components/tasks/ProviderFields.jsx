import { providersFor } from '../../lib/taskFormat'

// Insurer / product provider and policy number, registered on the parent's react-hook-form.
// Claims only list providers for that product line; requests can use any provider.
export function ProviderFields({ providers, category, register, required = true }) {
  const options = providersFor(providers, category)
  return <div className="form-grid">
    <label>{category ? 'Your insurer' : 'Product provider'}{required && ' *'}
      <select {...register('providerId', { required })} required={required}>
        <option value="" disabled>Choose…</option>
        {options.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
      </select>
      <small>Royal Square works with many providers. Each one sees only its own product.</small>
    </label>
    <label>Policy number
      <input maxLength={60} placeholder="If you have it" {...register('policyNumber')} />
    </label>
  </div>
}
