import { useState } from 'react'
import { completeClientAction } from '../../api/tasks'
import { Alert } from './TaskBits'

const SUBMIT_LABEL = { date: 'Confirm date', review: 'Close with review', upload: 'I have uploaded everything', confirm: 'Done' }

// The "Needs you" card: whatever the current step needs from the client.
export function ClientActionPanel({ task, onChange }) {
  const action = task.permissions?.clientAction
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!action) return null

  async function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const body = action.kind === 'date'
      ? { date: data.get('date') }
      : action.kind === 'review'
        ? { rating: Number(data.get('rating')), review: data.get('review').trim() || undefined }
        : {}
    setBusy(true); setError('')
    try { onChange(await completeClientAction(task.id, body)) }
    catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }

  return <form className="card rs-needs" onSubmit={submit} aria-labelledby="needs-you">
    <span className="rs-chip red">Needs you</span>
    <h2 id="needs-you">{action.label}</h2>
    {action.kind === 'upload' && <p>Add the documents below under Documents, then let us know you are done.</p>}
    {action.kind === 'confirm' && <p>Tell us once this is done and we will take it from there.</p>}
    <fieldset className="rs-actions" disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
      {action.kind === 'date' && <label>Date<input type="date" name="date" min={new Date().toLocaleDateString('en-CA')} required /></label>}
      {action.kind === 'review' && <>
        <fieldset className="rs-rating" style={{ flex: '1 1 100%' }}>
          <legend>How did we do? *</legend>
          {[1, 2, 3, 4, 5].map(value => <label key={value}><input type="radio" name="rating" value={value} required />{value}</label>)}
        </fieldset>
        <label style={{ flex: '1 1 100%' }}>A short review (optional)<textarea name="review" maxLength={2000} /></label>
      </>}
      <button className="primary">{busy ? 'Saving…' : SUBMIT_LABEL[action.kind] || 'Done'}</button>
    </fieldset>
    <Alert>{error}</Alert>
  </form>
}
