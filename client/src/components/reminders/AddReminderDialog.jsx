import { useEffect, useState } from 'react'
import { addReminder } from '../../api/reminders'
import { AUDIENCE_LABELS } from '../../lib/reminderTable'

// Popup for scheduling a reminder for a client. The reminder type sets sensible defaults for who
// is told and how often it repeats, and both can be changed. A repeating reminder keeps its
// first date as the anchor, so "every 12 months" from a birthday always lands on the birthday.
// Closes on Cancel or Escape, not on a click outside, so typed details aren't lost by accident.
export function AddReminderDialog({ clients, rules, onClose, onAdded }) {
  const enabledRules = rules.filter(rule => rule.enabled)
  const [ruleId, setRuleId] = useState(enabledRules[0]?.id ?? '')
  const [audience, setAudience] = useState(enabledRules[0]?.audience ?? 'both')
  const [repeat, setRepeat] = useState(String(enabledRules[0]?.repeatMonths ?? 0))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (busy) return
    const closeOnEscape = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  function chooseRule(id) {
    setRuleId(id)
    const rule = enabledRules.find(candidate => candidate.id === id)
    if (rule) { setAudience(rule.audience); setRepeat(String(rule.repeatMonths)) }
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const data = new FormData(event.currentTarget)
    try {
      const reminder = await addReminder({
        clientId: data.get('client'),
        ruleId,
        dueDate: data.get('due_date'),
        audience,
        repeatMonths: Number(repeat),
      })
      onAdded(reminder)
    } catch (error) {
      setError(error.message)
      setBusy(false)
    }
  }

  const blocked = !clients.length ? 'Add a client before scheduling reminders.' : !enabledRules.length ? 'There are no reminder types available.' : ''

  return <div className="modal-backdrop">
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-reminder-title">
      <div className="section-heading">
        <div><h2 id="add-reminder-title">Add a reminder</h2><p>Choose the client, what it is for, and when it is due. * Required fields.</p></div>
      </div>
      {blocked
        ? <><p className="error" role="alert">{blocked}</p><div className="form-actions"><button type="button" onClick={onClose}>Close</button></div></>
        : <form className="form-stack" style={{ gap: 14 }} onSubmit={submit}>
          <label>Client *<select name="client" required autoFocus disabled={busy}>
            {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select></label>
          <label>Reminder type *<select value={ruleId} onChange={event => chooseRule(event.target.value)} disabled={busy}>
            {enabledRules.map(rule => <option key={rule.id} value={rule.id}>{rule.title}</option>)}
          </select></label>
          <label>Due date *<input name="due_date" type="date" required disabled={busy} /></label>
          <label>Who is notified<select value={audience} onChange={event => setAudience(event.target.value)} disabled={busy}>
            {Object.entries(AUDIENCE_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select></label>
          <label>Repeat every (months)<input type="number" min="0" max="120" step="1" required value={repeat} onChange={event => setRepeat(event.target.value)} disabled={busy} /><small>0 means one time only.</small></label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="form-actions">
            <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="primary" disabled={busy}>{busy ? 'Adding…' : 'Add reminder'}</button>
          </div>
        </form>}
    </div>
  </div>
}
