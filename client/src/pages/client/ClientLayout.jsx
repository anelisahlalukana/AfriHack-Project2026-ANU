import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { Bell, FileText, House, User } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { isStaff, accountHome } from '../../lib/authRoles'
import { getOwnClient } from '../../api/clients'

// Shell for every signed-in client page: a slim top bar, the page, and a bottom
// navigation bar (Home, Documents, Reminders, Profile). Built mobile-first; the bar floats
// centred on wider screens. Loads the client's own record once and shares it with
// the pages through the outlet context.
export default function ClientLayout() {
  const { user } = useAuth()
  const staff = isStaff(user)
  // undefined while loading, null when this login has no client profile.
  const [client, setClient] = useState(undefined)
  const [clientError, setClientError] = useState('')

  useEffect(() => {
    if (staff) return
    let active = true
    getOwnClient(user.id)
      .then(row => { if (active) { setClient(row); setClientError('') } })
      .catch(error => { if (active) { setClient(null); setClientError(error.message) } })
    return () => { active = false }
  }, [staff, user.id])

  // Staff have their own workspaces; this area is for clients.
  if (staff) return <Navigate to={accountHome(user)} replace />

  return <div className="client-shell">
    <header className="client-top"><img src="/images/slogan.png" alt="Royal Square Financial" /></header>
    <main className="client-content"><Outlet context={{ user, client, clientError, setClient }} /></main>
    <nav className="bottom-nav" aria-label="Main">
      <NavLink to="/account" end><House size={22} /> Home</NavLink>
      <NavLink to="/account/documents"><FileText size={22} /> Documents</NavLink>
      <NavLink to="/account/reminders"><Bell size={22} /> Reminders</NavLink>
      <NavLink to="/account/profile"><User size={22} /> Profile</NavLink>
    </nav>
  </div>
}
