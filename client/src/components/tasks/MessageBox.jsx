import { useState } from 'react'
import { Send } from 'lucide-react'
import { postUpdate } from '../../api/tasks'
import { Alert } from './TaskBits'

// Two-way messages on a claim or request (replaces the WhatsApp and email back-and-forth).
export function MessageBox({ task, onChange, staff = false }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function send(event) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const note = data.get('note').trim()
    if (!note) return
    setBusy(true); setError('')
    try {
      onChange(await postUpdate(task.id, staff ? { note, visibleToClient: !data.get('internal') } : { note }))
      form.reset()
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  return <form className="rs-form" onSubmit={send}>
    <label>{staff ? 'Message or note' : 'Send a message to your adviser'}
      <textarea name="note" maxLength={2000} required disabled={busy} />
    </label>
    <div className="rs-row-actions">
      {staff && <label className="checkbox"><input type="checkbox" name="internal" disabled={busy} />Internal note (hidden from the client)</label>}
      <button className="primary" disabled={busy}><Send size={15} /> {busy ? 'Sending…' : 'Send'}</button>
    </div>
    <Alert>{error}</Alert>
  </form>
}
