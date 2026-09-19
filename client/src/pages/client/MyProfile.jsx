import ExtendedProfile from '../../components/clients/ExtendedProfile'
import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

export default function MyProfile() {
  const { client, clientError, setClient } = useOutletContext()
  const { signOut } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function logout() {
    setBusy(true)
    setError('')
    try { await signOut() }
    catch (error) { setError(error.message); setBusy(false) }
  }

  return <>
    <header>
      <p className="eyebrow">YOUR PROFILE</p>
      <h1>Profile</h1>
    </header>

    {clientError && <p className="error card" role="alert">{clientError}</p>}
    {client === undefined && <p role="status">Loading…</p>}

    {client === null && !clientError && <p className="card">No client profile is linked to your account. Please contact your adviser.</p>}

    {client && <ExtendedProfile key={client.id} client={client} onSaved={setClient} />}

    <section className="card">
      {error && <p className="error" role="alert">{error}</p>}
      <button onClick={logout} disabled={busy}><LogOut size={18} /> {busy ? 'Signing out…' : 'Sign out'}</button>
    </section>
  </>
}
