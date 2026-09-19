import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useMe } from '../../hooks/useTasks'
import '../../styles/claims.css'

// Client-facing shell for claims and requests. Requires the login to be linked to a client record.
export default function ClientPortalLayout() {
  const { signOut, user } = useAuth()
  const me = useMe()
  const [error, setError] = useState('')
  async function logout() {
    try { await signOut() } catch (err) { setError(err.message) }
  }
  let body
  if (me.loading) body = <p role="status">Loading your account…</p>
  else if (me.error) body = <div className="card" role="alert"><p className="error">{me.error}</p><button onClick={me.retry}>Try again</button></div>
  else if (me.data?.role === 'client' && !me.data.client) {
    body = <section className="card"><p className="eyebrow">ALMOST THERE</p><h1>Your account is not linked yet</h1><p>Ask your Royal Square adviser to link {user.email} to your client profile. Then you can report claims and send requests here.</p></section>
  } else body = <Outlet context={{ me: me.data }} />

  return <div className="rs-portal">
    <header className="rs-portal-top">
      <NavLink to="/account"><img src="/images/logo.jpg" alt="Royal Square Financial" /></NavLink>
      <nav aria-label="Client portal">
        <NavLink to="/account/claims" end>My claims & requests</NavLink>
        <NavLink to="/account/claims/new">Report a claim</NavLink>
        <NavLink to="/account/requests/new">Ask for something</NavLink>
        <button onClick={logout}><LogOut size={15} /> Sign out</button>
      </nav>
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    {body}
  </div>
}
