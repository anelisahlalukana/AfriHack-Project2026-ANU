import { useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, Link, NavLink } from 'react-router-dom'
import { Bell, Inbox, LayoutDashboard, LogOut, ShieldEllipsis, Users } from 'lucide-react'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import CompleteRegistration from './pages/client/CompleteRegistration'
import ClientLayout from './pages/client/ClientLayout'
import ClientHome from './pages/client/ClientHome'
import ClientDocuments from './pages/client/ClientDocuments'
import ClientReminders from './pages/client/ClientReminders'
import MyProfile from './pages/client/MyProfile'
import Dashboard from './pages/advisor/Dashboard'
import Clients from './pages/advisor/Clients'
import Reminders from './pages/advisor/Reminders'
import ClientProfile from './pages/advisor/ClientProfile'
import ClientForm from './pages/advisor/ClientForm'
import AdviserCompliance from './pages/advisor/AdviserCompliance'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import Tasks from './pages/Tasks'
import AdviserTaskDetail from './pages/claims/AdviserTaskDetail'
import ClientTaskDetail from './pages/claims/ClientTaskDetail'
import MyRequests from './pages/claims/MyRequests'
import NewRequest from './pages/claims/NewRequest'
import ReportClaim from './pages/claims/ReportClaim'
import ClientPortalLayout from './components/tasks/ClientPortalLayout'
import './App.css'

function SignOutBlock({ onSignOut }) {
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  async function logout() {
    setSigningOut(true); setError('')
    try { await onSignOut() }
    catch (error) { setError(error.message) }
    finally { setSigningOut(false) }
  }
  return <div className="advisor">
    <button onClick={logout} disabled={signingOut}><LogOut size={16} /> {signingOut ? 'Signing out…' : 'Sign out'}</button>
    {error && <p role="alert" className="error">{error}</p>}
  </div>
}

function WorkspaceLayout() {
  const { session, signOut } = useAuth()
  const name = session.user.user_metadata?.full_name || session.user.email
  return <div className="app-shell">
    <aside>
      <Link className="side-logo" to="/"><img src="/images/slogan.png" alt="Royal Square Financial" /></Link>
      <p className="side-name">{name}</p>
      <p className="eyebrow">ADVISOR WORKSPACE</p>
      <hr className="side-divider" />
      <nav>
        <NavLink to="/" end><LayoutDashboard size={18} /> Client overview</NavLink>
        <NavLink to="/clients"><Users size={18} /> Clients</NavLink>
        <NavLink to="/tasks"><Inbox size={18} /> Requests & claims</NavLink>
        <NavLink to="/reminders"><Bell size={18} /> Reminders</NavLink>
        <NavLink to={`/compliance/${session.user.id}`}><ShieldEllipsis size={18} /> My compliance</NavLink>
      </nav>
      <SignOutBlock onSignOut={signOut} />
    </aside>
    <main key={session.user.id}><div className="workspace-label">ROYAL SQUARE FINANCIAL <span>Client management</span></div><Outlet /></main>
  </div>
}

function AdminLayout() {
  const { session, signOut } = useAuth()
  const name = session.user.user_metadata?.full_name || session.user.email
  return <div className="app-shell">
    <aside>
      <Link className="side-logo" to="/admin"><img src="/images/slogan.png" alt="Royal Square Financial" /></Link>
      <p className="side-name">{name}</p>
      <p className="eyebrow">ADMIN</p>
      <hr className="side-divider" />
      <nav>
        <NavLink to="/admin" end><LayoutDashboard size={18} /> Dashboard</NavLink>
        <NavLink to="/admin/users"><Users size={18} /> User management</NavLink>
      </nav>
      <SignOutBlock onSignOut={signOut} />
    </aside>
    <main key={session.user.id}><div className="workspace-label">ROYAL SQUARE FINANCIAL <span>Admin</span></div><Outlet /></main>
  </div>
}

export default function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/complete-registration" element={<CompleteRegistration />} />
    <Route path="/reset-password" element={<ResetPassword />} />

    <Route element={<ProtectedRoute />}>
      {/* Client home, documents, reminders and profile (bottom navigation). */}
      <Route path="/account" element={<ClientLayout />}>
        <Route index element={<ClientHome />} />
        <Route path="documents" element={<ClientDocuments />} />
        <Route path="reminders" element={<ClientReminders />} />
        <Route path="profile" element={<MyProfile />} />
      </Route>
      {/* Client claims and requests: wider pages with their own top navigation. */}
      <Route element={<ClientPortalLayout />}>
        <Route path="/account/claims" element={<MyRequests />} />
        <Route path="/account/claims/new" element={<ReportClaim />} />
        <Route path="/account/claims/:taskId/continue" element={<ReportClaim />} />
        <Route path="/account/requests/new" element={<NewRequest />} />
        <Route path="/account/tasks/:taskId" element={<ClientTaskDetail />} />
      </Route>
    </Route>

    <Route element={<ProtectedRoute staffOnly adminOnly />}>
      <Route element={<AdminLayout />}>
        <Route path="admin" element={<AdminDashboard />} />
        <Route path="admin/users" element={<AdminUsers />} />
      </Route>
    </Route>

    <Route element={<ProtectedRoute staffOnly excludeAdmin />}>
    <Route element={<WorkspaceLayout />}>
      <Route index element={<Dashboard />} />
      <Route path="clients" element={<Clients />} />
      <Route path="reminders" element={<Reminders />} />
      <Route path="workspace" element={<Navigate to="/reminders" replace />} />
      <Route path="clients/new" element={<Navigate to="/clients?add=1" replace />} />
      <Route path="clients/:id" element={<ClientProfile />} />
      <Route path="clients/:id/edit" element={<ClientForm />} />
      <Route path="compliance/:adviserId" element={<AdviserCompliance />} />
      <Route path="tasks" element={<Tasks />} />
      <Route path="tasks/new" element={<NewRequest staff />} />
      <Route path="tasks/:taskId" element={<AdviserTaskDetail />} />
      <Route path="*" element={<div className="card"><h1>Page not found</h1><Link to="/">Return to your clients</Link></div>} />
    </Route>
    </Route>
  </Routes></AuthProvider></BrowserRouter>
}
