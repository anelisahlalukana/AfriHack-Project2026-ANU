import { useState } from 'react'
import { Send } from 'lucide-react'
import { postUpdate } from '../../api/tasks'
import { errorMessage } from '../../lib/taskFormat'
import { Alert } from './TaskBits'

// Two-way messages on a claim or request (replaces the WhatsApp and email back-and-forth).
export function MessageBox({ task, onChange, staff = false }) {
  const [note, setNote] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function send(event) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      onChange(await postUpdate(task.id, staff ? { note, visibleToClient: !internal } : { note }))
      setNote(''); setInternal(false)
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  return <form className="rs-form" onSubmit={send}>
    <label>{staff ? 'Message or note' : 'Send a message to your adviser'}
      <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} required />
    </label>
    <div className="rs-row-actions">
      {staff && <label className="checkbox"><input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />Internal note (hidden from the client)</label>}
      <button className="primary" disabled={busy || !note.trim()}><Send size={15} /> {busy ? 'Sending…' : 'Send'}</button>
    </div>
    <Alert>{error}</Alert>
  </form>
}
