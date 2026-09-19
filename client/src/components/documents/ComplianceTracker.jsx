import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import CpdBlock from '../compliance/CpdBlock'
import { ShieldEllipsis } from 'lucide-react'
import { getAdviserCompliance, updateAdviserCompliance } from '../../api/compliance'

const QUALIFICATION_STATUSES = [
  { value: 'qualified', label: 'Qualified' },
  { value: 'pending', label: 'Pending' },
  { value: 'suspended', label: 'Suspended' },
]

const CPD_STATUSES = [
  { value: 'up_to_date', label: 'Up to date' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'not_started', label: 'Not started' },
  { value: 'overdue', label: 'Overdue' },
]

function statusBadgeClass(value) {
  if (['qualified', 'up_to_date'].includes(value)) return 'badge status-signed'
  if (['suspended', 'overdue'].includes(value)) return 'badge status-flagged'
  return 'badge status-sent'
}

function flagBadgeClass(flagged) {
  return flagged ? 'badge status-flagged' : 'badge status-signed'
}

// Adviser-facing compliance status: qualification/CPD standing and
// PEP / terrorism-financing screening flags, with an edit form.
export function ComplianceTracker({ adviserId, onChanged }) {
  const { session } = useAuth()
  const canEdit = session?.user.id === adviserId
  const [compliance, setCompliance] = useState(null)
  const [form, setForm] = useState(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    getAdviserCompliance(adviserId)
      .then(record => {
        if (!active) return
        setCompliance(record)
        setForm(record)
        setError('')
      })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [adviserId, reloadKey])

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const updated = await updateAdviserCompliance(adviserId, {
        qualificationStatus: form.qualificationStatus,
        isPoliticallyExposed: form.isPoliticallyExposed,
        pepDetails: form.pepDetails,
        terrorismFinancingFlag: form.terrorismFinancingFlag,
        terrorismFinancingDetails: form.terrorismFinancingDetails,
      })
      setCompliance(updated)
      setForm(updated)
      setEditing(false)
      setReloadKey(key => key + 1)
      onChanged?.()
    } catch (error) {
      setError(error.message)
    } finally {
      setSaving(false)
    }
  }

  if (!compliance) {
    return <section className="card">
      <header className="section-heading"><div><h2><ShieldEllipsis size={20} /> Compliance</h2></div></header>
      <p role={error ? 'alert' : 'status'}>{error || 'Loading…'}</p>
      {error && <button onClick={() => setReloadKey(key => key + 1)}>Retry</button>}
    </section>
  }

  return <section className="card">
    <header className="section-heading"><div><h2><ShieldEllipsis size={20} /> Compliance</h2><p>Qualification, CPD and adviser declarations</p></div></header>
    {error && <p className="error" role="alert">{error}</p>}

    {!editing ? (
      <>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          <div><small>Qualification</small><div style={{ marginTop: 4 }}>
            <span className={statusBadgeClass(compliance.qualificationStatus)}>
              {QUALIFICATION_STATUSES.find(s => s.value === compliance.qualificationStatus)?.label || compliance.qualificationStatus}
            </span>
          </div></div>
          <div><small>CPD</small><div style={{ marginTop: 4 }}>
            <span className={statusBadgeClass(compliance.cpdStatus)}>
              {CPD_STATUSES.find(s => s.value === compliance.cpdStatus)?.label || compliance.cpdStatus}
            </span>
          </div></div>
          <div><small>Adviser PEP declaration</small><div style={{ marginTop: 4 }}>
            <span className={flagBadgeClass(compliance.isPoliticallyExposed)}>
              {compliance.isPoliticallyExposed ? 'Flagged' : 'Not declared'}
            </span>
          </div></div>
          <div><small>Adviser terrorism-financing flag</small><div style={{ marginTop: 4 }}>
            <span className={flagBadgeClass(compliance.terrorismFinancingFlag)}>
              {compliance.terrorismFinancingFlag ? 'Flagged' : 'Not flagged'}
            </span>
          </div></div>
        </div>

        {(compliance.pepDetails || compliance.terrorismFinancingDetails) && (
          <div className="muted" style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {compliance.pepDetails && <p>PEP notes: {compliance.pepDetails}</p>}
            {compliance.terrorismFinancingDetails && <p>Terrorism financing notes: {compliance.terrorismFinancingDetails}</p>}
          </div>
        )}

        {canEdit && <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="primary" onClick={() => setEditing(true)}>Edit</button>
        </div>}
      </>
    ) : (
      <form className="form-stack" onSubmit={handleSave}>
        <div className="form-grid">
          <label>Qualification status
            <select
              value={form.qualificationStatus}
              onChange={event => setForm({ ...form, qualificationStatus: event.target.value })}
            >
              {QUALIFICATION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>

        </div>

        <div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.isPoliticallyExposed}
              onChange={event => setForm({ ...form, isPoliticallyExposed: event.target.checked })}
            />
            Politically exposed person flag
          </label>
          {form.isPoliticallyExposed && (
            <label style={{ marginTop: 10 }}>PEP details
              <input
                value={form.pepDetails || ''}
                onChange={event => setForm({ ...form, pepDetails: event.target.value })}
              />
            </label>
          )}
        </div>

        <div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.terrorismFinancingFlag}
              onChange={event => setForm({ ...form, terrorismFinancingFlag: event.target.checked })}
            />
            Terrorism-financing check flag
          </label>
          {form.terrorismFinancingFlag && (
            <label style={{ marginTop: 10 }}>Terrorism financing details
              <input
                value={form.terrorismFinancingDetails || ''}
                onChange={event => setForm({ ...form, terrorismFinancingDetails: event.target.value })}
              />
            </label>
          )}
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="form-actions">
          <button
            type="button"
            onClick={() => { setForm(compliance); setEditing(false) }}
            disabled={saving}
          >
            Cancel
          </button>
          <button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    )}
    <CpdBlock adviserId={adviserId} cpd={compliance.cpd} canEdit={canEdit} onChanged={() => {
      setReloadKey(key => key + 1)
      onChanged?.()
    }} />
  </section>
}
