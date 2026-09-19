import { useState } from 'react'
import { Star } from 'lucide-react'
import { completeClientAction } from '../../api/tasks'
import { errorMessage, todayInputValue } from '../../lib/taskFormat'
import { Alert } from './TaskBits'

// The "Needs you" card: whatever the current step needs from the client.
export function ClientActionPanel({ task, onChange }) {
  const action = task.permissions?.clientAction
  const [date, setDate] = useState('')
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [minDate] = useState(() => todayInputValue())
  if (!action) return null

  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const body = action.kind === 'date' ? { date } : action.kind === 'review' ? { rating, review } : {}
      onChange(await completeClientAction(task.id, body))
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }

  return <form className="card rs-needs" onSubmit={submit} aria-labelledby="needs-you">
    <span className="rs-chip red">Needs you</span>
    <h2 id="needs-you">{action.label}</h2>
    {action.kind === 'upload' && <p>Add the documents below under Documents, then let us know you are done.</p>}
    {action.kind === 'confirm' && <p>Tell us once this is done and we will take it from there.</p>}
    <div className="rs-actions">
      {action.kind === 'date' && <label>Date<input type="date" min={minDate} value={date} onChange={e => setDate(e.target.value)} required /></label>}
      {action.kind === 'review' && <>
        <fieldset className="form-stack" style={{ flex: '1 1 100%' }}>
          <legend>How did we do?</legend>
          <div className="rs-row-actions" role="radiogroup" aria-label="Rating out of 5">
            {[1, 2, 3, 4, 5].map(value => <button type="button" key={value} role="radio" aria-checked={rating === value} aria-label={`${value} out of 5`} className={rating >= value ? 'primary' : ''} onClick={() => setRating(value)}><Star size={16} /></button>)}
          </div>
        </fieldset>
        <label style={{ flex: '1 1 100%' }}>A short review (optional)<textarea value={review} maxLength={2000} onChange={e => setReview(e.target.value)} /></label>
      </>}
      <button className="primary" disabled={busy || (action.kind === 'review' && !rating)}>
        {busy ? 'Saving…' : action.kind === 'date' ? 'Confirm date' : action.kind === 'review' ? 'Close with review' : action.kind === 'upload' ? 'I have uploaded everything' : 'Done'}
      </button>
    </div>
    <Alert>{error}</Alert>
  </form>
}
