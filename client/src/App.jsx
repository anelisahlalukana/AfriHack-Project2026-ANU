import { useState } from 'react'
import { BrowserRouter, Outlet, Route, Routes, Link } from 'react-router-dom'
import { LayoutDashboard, LogOut, Plus, ShieldCheck, ShieldEllipsis, Users } from 'lucide-react'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './hooks/useAuth'
import { isAdmin } from './lib/authRoles'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import ClientAccount from './pages/ClientAccount'
import Dashboard from './pages/Dashboard'
import ClientProfile from './pages/ClientProfile'
import ClientForm from './pages/ClientForm'
import AdviserCompliance from './pages/AdviserCompliance'
import AdminUsers from './pages/AdminUsers'
import './App.css'

function WorkspaceLayout() {
  const { session, signOut } = useAuth()
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  async function logout() {
    setSigningOut(true); setError('')
    try { await signOut() }
    catch (error) { setError(error.message) }
    finally { setSigningOut(false) }
  }
  return <div className="app-shell">
    <aside><Link className="brand" to="/"><img src="/images/logo.jpg" alt="Royal Square Financial" /></Link>
      <p className="eyebrow">ADVISOR WORKSPACE</p>
      <nav>
        <Link to="/"><LayoutDashboard size={18} /> Client overview</Link>
        <Link to="/clients/new"><Plus size={18} /> Onboard a client</Link>
        <Link to={`/compliance/${session.user.id}`}><ShieldEllipsis size={18} /> My compliance</Link>
        {isAdmin(session.user) && <Link to="/admin/users"><Users size={18} /> User management</Link>}
      </nav>
      <div className="advisor"><ShieldCheck size={22} /><span>{session.user.email}</span><button onClick={logout} disabled={signingOut}><LogOut size={16} /> {signingOut ? 'Signing out…' : 'Sign out'}</button>{error && <p role="alert" className="error">{error}</p>}</div>
    </aside>
    <main key={session.user.id}><div className="workspace-label">ROYAL SQUARE FINANCIAL <span>Client management</span></div><Outlet /></main>
  </div>
}
export default function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/login" element={<Login key="login" />} />
    <Route path="/signup" element={<Login key="signup" signup />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route element={<ProtectedRoute />}><Route path="/account" element={<ClientAccount />} /></Route>
    <Route element={<ProtectedRoute staffOnly />}>
    <Route element={<WorkspaceLayout />}>
      <Route index element={<Dashboard />} />
      <Route path="clients/new" element={<ClientForm />} />
      <Route path="clients/:id" element={<ClientProfile />} />
      <Route path="clients/:id/edit" element={<ClientForm />} />
      <Route path="compliance/:adviserId" element={<AdviserCompliance />} />
      <Route element={<ProtectedRoute adminOnly />}>
        <Route path="admin/users" element={<AdminUsers />} />
      </Route>
      <Route path="*" element={<div className="card"><h1>Page not found</h1><Link to="/">Return to your clients</Link></div>} />
    </Route>
    </Route>
  </Routes></AuthProvider></BrowserRouter>
}
