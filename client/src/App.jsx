import { useState } from 'react'
import { BrowserRouter, Outlet, Route, Routes, Link, NavLink } from 'react-router-dom'
import { LayoutDashboard, LogOut, Plus, ShieldCheck, ShieldEllipsis, Users } from 'lucide-react'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import ClientAccount from './pages/ClientAccount'
import Dashboard from './pages/Dashboard'
import ClientProfile from './pages/ClientProfile'
import ClientForm from './pages/ClientForm'
import AdviserCompliance from './pages/AdviserCompliance'
import AdminDashboard from './pages/AdminDashboard'
import AdminUsers from './pages/AdminUsers'
import Dev4Demo from './pages/Dev4Demo'
import SharedWorkspace from './pages/SharedWorkspace'
import Brand from './components/Brand'
import ThemeToggle from './components/ThemeToggle'
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
    <aside><Link className="brand" to="/"><Brand /></Link>
      <p className="eyebrow">ADVISOR WORKSPACE</p>
      <nav>
        <NavLink to="/" end><LayoutDashboard size={18} /> Client overview</NavLink>
        <NavLink to="/clients/new"><Plus size={18} /> Onboard a client</NavLink>
        <NavLink to="/workspace"><Users size={18} /> Reminders & messages</NavLink>
        <NavLink to={`/compliance/${session.user.id}`}><ShieldEllipsis size={18} /> My compliance</NavLink>
      </nav>
      <div className="advisor"><ShieldCheck size={22} /><span>{session.user.email}</span><button onClick={logout} disabled={signingOut}><LogOut size={16} /> {signingOut ? 'Signing out…' : 'Sign out'}</button>{error && <p role="alert" className="error">{error}</p>}</div>
    </aside>
    <main key={session.user.id}><div className="workspace-label">ROYAL SQUARE FINANCIAL <span className="workspace-actions">Client management <ThemeToggle /></span></div><Outlet /></main>
  </div>
}

function AdminLayout() {
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
    <aside><Link className="brand" to="/admin"><Brand /></Link>
      <p className="eyebrow">ADMIN</p>
      <nav>
        <NavLink to="/admin" end><LayoutDashboard size={18} /> Dashboard</NavLink>
        <NavLink to="/admin/users"><Users size={18} /> User management</NavLink>
      </nav>
      <div className="advisor"><ShieldCheck size={22} /><span>{session.user.email}</span><button onClick={logout} disabled={signingOut}><LogOut size={16} /> {signingOut ? 'Signing out…' : 'Sign out'}</button>{error && <p role="alert" className="error">{error}</p>}</div>
    </aside>
    <main key={session.user.id}><div className="workspace-label">ROYAL SQUARE FINANCIAL <span className="workspace-actions">Admin <ThemeToggle /></span></div><Outlet /></main>
  </div>
}

function AuthenticatedApp() {
  return <AuthProvider><Routes>
    <Route path="/login" element={<Login key="login" />} />
    <Route path="/signup" element={<Login key="signup" signup />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route element={<ProtectedRoute />}><Route path="/account" element={<ClientAccount />} /><Route path="/workspace" element={<SharedWorkspace />} /></Route>

    <Route element={<ProtectedRoute staffOnly adminOnly />}>
      <Route element={<AdminLayout />}>
        <Route path="admin" element={<AdminDashboard />} />
        <Route path="admin/users" element={<AdminUsers />} />
      </Route>
    </Route>

    <Route element={<ProtectedRoute staffOnly excludeAdmin />}>
    <Route element={<WorkspaceLayout />}>
      <Route index element={<Dashboard />} />
      <Route path="clients/new" element={<ClientForm />} />
      <Route path="clients/:id" element={<ClientProfile />} />
      <Route path="clients/:id/edit" element={<ClientForm />} />
      <Route path="compliance/:adviserId" element={<AdviserCompliance />} />
      <Route path="*" element={<div className="card"><h1>Page not found</h1><Link to="/">Return to your clients</Link></div>} />
    </Route>
    </Route>
  </Routes></AuthProvider>
}

export default function App() {
  return <BrowserRouter><Routes><Route path="/dev4-demo" element={<Dev4Demo />} /><Route path="*" element={<AuthenticatedApp />} /></Routes></BrowserRouter>
}
