import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

// Read-only for now: the client's details as their adviser recorded them, plus sign out.
export default function MyProfile() {
  const { user, client, clientError } = useOutletContext()
  const { signOut } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function logout() {
    setBusy(true)
    setError('')
    try { await signOut() }
    catch (error) { setError(error.message); setBusy(false) }
  }

  const fullName = client
    ? [client.first_name, client.second_name, client.surname].filter(Boolean).join(' ')
    : user.user_metadata?.full_name
  const details = [
    ['Name', fullName],
    ['ID number', client?.id_number],
    ['Email', client?.contact_email || user.email],
    ['Mobile', client?.contact_mobile],
    ['Address', client?.physical_address],
  ]

  return <>
    <header>
      <p className="eyebrow">YOUR PROFILE</p>
      <h1>Profile</h1>
    </header>

    {clientError && <p className="error card" role="alert">{clientError}</p>}
    {client === undefined && <p role="status">Loading…</p>}

    {client !== undefined && <section className="card">
      <h2>Your details</h2>
      <dl>{details.map(([label, value]) => <div className="detail-row" key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
      <small>To change any of these, contact your adviser.</small>
    </section>}

    <section className="card">
      {error && <p className="error" role="alert">{error}</p>}
      <button onClick={logout} disabled={busy}><LogOut size={18} /> {busy ? 'Signing out…' : 'Sign out'}</button>
    </section>
  </>
}
