import { useEffect, useState } from 'react'
import { addClient } from '../../api/clients'

// Popup for adding a client: only the details an adviser knows on day one. The server
// creates their login and emails them an invitation; the full financial needs analysis
// is a later step from the client's overview. Closes on Cancel or Escape, but not on a
// click outside, so a stray click can't throw away what was typed.
export function AddClientDialog({ onClose, onAdded }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (busy) return
    const closeOnEscape = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const data = new FormData(event.currentTarget)
    try {
      const client = await addClient({
        first_name: data.get('first_name').trim(),
        second_name: data.get('second_name').trim() || null,
        surname: data.get('surname').trim(),
        contact_email: data.get('contact_email').trim(),
        contact_mobile: data.get('contact_mobile').trim() || null,
      })
      onAdded(client)
    } catch (error) {
      setError(error.message)
      setBusy(false)
    }
  }

  return <div className="modal-backdrop">
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-client-title">
      <div className="section-heading">
        <div><h2 id="add-client-title">Add a client</h2><p>Enter the basics. We'll email them an invitation to finish registering. * Required fields.</p></div>
      </div>
      <form className="form-stack" style={{ gap: 14 }} onSubmit={submit}>
        <label>First name *<input name="first_name" autoComplete="off" required autoFocus disabled={busy} /></label>
        <label>Second name<input name="second_name" autoComplete="off" disabled={busy} /></label>
        <label>Surname *<input name="surname" autoComplete="off" required disabled={busy} /></label>
        <label>Email address *<input name="contact_email" type="email" autoComplete="off" required disabled={busy} /></label>
        <label>Mobile number<input name="contact_mobile" type="tel" autoComplete="off" disabled={busy} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" disabled={busy}>{busy ? 'Adding client…' : 'Add client and send invitation'}</button>
        </div>
      </form>
    </div>
  </div>
}
