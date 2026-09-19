import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Bell, FileText, House, LogOut, ShieldAlert, User } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { isStaff, accountHome } from '../../lib/authRoles'
import { getOwnClient } from '../../api/clients'
import { AskChat } from '../../components/tasks/AskChat'
import ThemeToggle from '../../components/ThemeToggle'

// Shell for every signed-in client page: a slim top bar, the page, and a bottom navigation bar
// (Home, Documents, Claims, Reminders, Profile). Built mobile-first; the bar floats centred on
// wider screens. Loads the client's own record once and shares it with the pages through the
// outlet context, along with a function that opens the "Ask for something" chat (the round
// button in the bottom-right corner). The top bar carries the Sign out button on every page.
export default function ClientLayout() {
  const { user, signOut } = useAuth()
  const { pathname } = useLocation()
  const staff = isStaff(user)
  // undefined while loading, null when this login has no client profile.
  const [client, setClient] = useState(undefined)
  const [clientError, setClientError] = useState('')
  const [askOpen, setAskOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  // The Claims tab stays lit on a claim's pages too (/account/claims/... and /account/tasks/:id).
  const claimsActive = pathname.startsWith('/account/claims') || pathname.startsWith('/account/tasks')

  useEffect(() => {
    if (staff) return
    let active = true
    getOwnClient(user.id)
      .then(row => { if (active) { setClient(row); setClientError('') } })
      .catch(error => { if (active) { setClient(null); setClientError(error.message) } })
    return () => { active = false }
  }, [staff, user.id])

  async function logout() {
    setSigningOut(true)
    setSignOutError('')
    try { await signOut() }
    catch (error) { setSignOutError(error.message); setSigningOut(false) }
  }

  // Staff have their own workspaces; this area is for clients.
  if (staff) return <Navigate to={accountHome(user)} replace />

  return <div className="client-shell">
    <header className="client-top">
      <ThemeToggle />
      <img src="/images/slogan.png" alt="Royal Square Financial" />
      <button type="button" className="signout" onClick={logout} disabled={signingOut} aria-label="Sign out"><LogOut size={16} /> <span>{signingOut ? 'Signing out…' : 'Sign out'}</span></button>
    </header>
    <main className="client-content">
      {signOutError && <p className="error card" role="alert">{signOutError}</p>}
      <Outlet context={{ user, client, clientError, setClient, openAsk: () => setAskOpen(true) }} />
    </main>
    {client && <AskChat open={askOpen} onOpen={() => setAskOpen(true)} onClose={() => setAskOpen(false)} name={client.first_name} />}
    <nav className="bottom-nav" aria-label="Main">
      <NavLink to="/account" end><House size={22} /> Home</NavLink>
      <NavLink to="/account/documents"><FileText size={22} /> Documents</NavLink>
      <NavLink to="/account/claims" className={() => (claimsActive ? 'active' : undefined)}><ShieldAlert size={22} /> Claims</NavLink>
      <NavLink to="/account/reminders"><Bell size={22} /> Reminders</NavLink>
      <NavLink to="/account/profile"><User size={22} /> Profile</NavLink>
    </nav>
  </div>
}
