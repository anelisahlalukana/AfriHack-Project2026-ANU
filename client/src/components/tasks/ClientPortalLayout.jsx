import { useState } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useMe } from '../../hooks/useTasks'
import { accountHome, isStaff } from '../../lib/authRoles'

// Client-facing shell for claims and requests. Staff are sent to their own workspace.
export default function ClientPortalLayout() {
  const { signOut, user } = useAuth()
  const [error, setError] = useState('')
  const staff = isStaff(user)
  const me = useMe(!staff)
  if (staff) return <Navigate to={accountHome(user)} replace />

  async function logout() {
    try { await signOut() } catch (error) { setError(error.message) }
  }
  let body
  if (me.loading) body = <p role="status">Loading your account…</p>
  else if (me.error) body = <div className="card" role="alert"><p className="error">{me.error}</p><button onClick={me.retry}>Try again</button></div>
  else if (!me.data?.client) {
    body = <section className="card"><p className="eyebrow">ALMOST THERE</p><h1>We couldn't find your client profile</h1><p>Please contact your Royal Square adviser so they can check your account.</p></section>
  } else body = <Outlet context={{ me: me.data }} />

  return <div className="rs-portal">
    <header className="rs-portal-top">
      <NavLink to="/account"><img src="/images/slogan.png" alt="Royal Square Financial" /></NavLink>
      <nav aria-label="Client portal">
        <NavLink to="/account" end>Home</NavLink>
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
