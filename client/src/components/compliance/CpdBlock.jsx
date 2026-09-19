import { useState } from 'react'
import { addCpdRecord } from '../../api/compliance'
import { complianceDate, cpdPercent, southAfricaToday } from '../../lib/complianceStatus'

export default function CpdBlock({ adviserId, cpd, canEdit, onChanged }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setSaving(true); setError('')
    try {
      await addCpdRecord(adviserId, { activity: data.get('activity'), hours: Number(data.get('hours')), completedOn: data.get('completedOn') })
      form.reset()
      onChanged()
    } catch (error) { setError(error.message) }
    finally { setSaving(false) }
  }
  return <section className="compliance-cpd" aria-label="Continuing professional development">
    <div className="section-heading"><div><h3>CPD activities</h3><p>{complianceDate(cpd.start)} – {complianceDate(cpd.end)}</p></div>
      <strong>{cpd.hours} / {cpd.requiredHours} hours</strong></div>
    <progress max="100" value={cpdPercent(cpd.hours, cpd.requiredHours)} aria-label="CPD hours towards cycle target" />
    <p>{cpd.remainingHours} hours outstanding. Prototype target; activities are self-recorded.</p>
    {!cpd.records.length ? <p className="empty">No CPD activities recorded.</p> : <ul className="compliance-activities">
      {cpd.records.map(record => <li key={record.id}><span>{record.activity}<small>{complianceDate(record.completedOn)}
        {record.completedOn < cpd.start || record.completedOn > cpd.end ? ' · Outside current cycle' : ''}</small></span><b>{record.hours} hours</b></li>)}
    </ul>}
    {canEdit && <form className="form-stack" onSubmit={submit}>
      <fieldset disabled={saving} className="compliance-fields">
        <legend>Log a CPD activity</legend>
        <label>Activity<input name="activity" required maxLength={200} /></label>
        <div className="form-grid"><label>Hours<input name="hours" type="number" min="0.01" max="100" step="0.01" required /></label>
          <label>Completed on<input name="completedOn" type="date" max={southAfricaToday()} required /></label></div>
        <button className="primary">{saving ? 'Saving…' : 'Add activity'}</button>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
    </form>}
  </section>
}
