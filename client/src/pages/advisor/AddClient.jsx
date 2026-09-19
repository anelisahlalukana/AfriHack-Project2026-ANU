import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { addClient } from '../../api/clients'

// Day-one details only. The full financial needs analysis is a later step, done
// from the client's profile (ClientForm.jsx).
export default function AddClient() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
      navigate(`/clients/${client.id}`, { replace: true })
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return <>
    <Link className="back" to="/"><ArrowLeft size={16} /> All clients</Link>
    <header className="page-heading">
      <div>
        <p className="eyebrow">NEW CLIENT</p>
        <h1>Add a client</h1>
        <p>Enter the basics. We'll email them an invitation to finish registering. You can complete their financial needs analysis afterwards. * Required fields.</p>
      </div>
    </header>
    <form className="card form-stack" onSubmit={submit}>
      <div className="form-grid">
        <label>First name *<input name="first_name" autoComplete="off" required disabled={busy} /></label>
        <label>Second name<input name="second_name" autoComplete="off" disabled={busy} /></label>
        <label>Surname *<input name="surname" autoComplete="off" required disabled={busy} /></label>
        <label>Email address *<input name="contact_email" type="email" autoComplete="off" required disabled={busy} /></label>
        <label>Mobile number<input name="contact_mobile" type="tel" autoComplete="off" disabled={busy} /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <Link className="button" to="/">Cancel</Link>
        <button className="primary" disabled={busy}>{busy ? 'Adding client…' : 'Add client and send invitation'}</button>
      </div>
    </form>
  </>
}
