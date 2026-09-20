import { useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, Link, NavLink } from 'react-router-dom'
import { Bell, HeartPulse, ChartColumn, Inbox, LayoutDashboard, LogOut, ShieldEllipsis, Users } from 'lucide-react'
import { AuthProvider } from './context/AuthContext'
import { initialsOf } from './lib/initials'
import { useAuth } from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import ThemeToggle from './components/ThemeToggle'
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
import ClientPulse from './pages/advisor/ClientPulse'
import ClientPulseDetail from './pages/advisor/ClientPulseDetail'
import Reminders from './pages/advisor/Reminders'
import ClientProfile from './pages/advisor/ClientProfile'
import ClientForm from './pages/advisor/ClientForm'
import AdviserCompliance from './pages/advisor/AdviserCompliance'
import Compliance from './pages/advisor/Compliance'
import Reports from './pages/advisor/Reports'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import Tasks from './pages/Tasks'
import AdviserTaskDetail from './pages/claims/AdviserTaskDetail'
import ClientTaskDetail from './pages/claims/ClientTaskDetail'
import MyRequests from './pages/claims/MyRequests'
import NewRequest from './pages/claims/NewRequest'
import ReportClaim from './pages/claims/ReportClaim'
import ClientClaimsArea from './pages/client/ClientClaimsArea'
import ProviderLayout from './pages/provider/ProviderLayout'
import ProviderInbox from './pages/provider/ProviderInbox'
import ProviderTaskDetail from './pages/provider/ProviderTaskDetail'
import './App.css'

function SignOutBlock({ onSignOut, name, role }) {
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  async function logout() {
    setSigningOut(true); setError('')
    try { await onSignOut() }
    catch (error) { setError(error.message) }
    finally { setSigningOut(false) }
  }
  return <div className="advisor">
    <div className="advisor-row">
      <div className="side-user">
        <span className="side-avatar" aria-hidden="true">{initialsOf(name)}</span>
        <span className="side-user-text"><strong title={name}>{name}</strong><small>{role}</small></span>
      </div>
      <ThemeToggle />
    </div>
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
      <p className="eyebrow">ADVISOR WORKSPACE</p>
      <hr className="side-divider" />
      <nav>
        <NavLink to="/" end><LayoutDashboard size={18} /> Dashboard</NavLink>
        <NavLink to="/clients"><Users size={18} /> Clients</NavLink>
        <NavLink to="/client-pulse"><HeartPulse size={18} /> Client Pulse</NavLink>
        <NavLink to="/reminders"><Bell size={18} /> Reminders</NavLink>
        <NavLink to="/tasks"><Inbox size={18} /> Requests & claims</NavLink>
        <NavLink to="/compliance"><ShieldEllipsis size={18} /> Compliance</NavLink>
        <NavLink to="/reports"><ChartColumn size={18} /> Reports</NavLink>
      </nav>
      <SignOutBlock onSignOut={signOut} name={name} role="Adviser" />
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
      <p className="eyebrow">ADMIN</p>
      <hr className="side-divider" />
      <nav>
        <NavLink to="/admin" end><LayoutDashboard size={18} /> Dashboard</NavLink>
        <NavLink to="/admin/users"><Users size={18} /> User management</NavLink>
        <NavLink to="/admin/reports"><ChartColumn size={18} /> Reports</NavLink>
      </nav>
      <SignOutBlock onSignOut={signOut} name={name} role="Administrator" />
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
      <Route path="/account" element={<ClientLayout />}>
        <Route index element={<ClientHome />} />
        <Route path="documents" element={<ClientDocuments />} />
        <Route path="reminders" element={<ClientReminders />} />
        <Route path="profile" element={<MyProfile />} />
        <Route element={<ClientClaimsArea />}>
          <Route path="claims" element={<MyRequests />} />
          <Route path="claims/new" element={<ReportClaim />} />
          <Route path="claims/:taskId/continue" element={<ReportClaim />} />
          {/* "Ask for something" is now the chat button; old links land on the claims page. */}
          <Route path="requests/new" element={<Navigate to="/account/claims" replace />} />
          <Route path="tasks/:taskId" element={<ClientTaskDetail />} />
        </Route>
      </Route>
    </Route>

    <Route element={<ProtectedRoute providerOnly />}>
      <Route element={<ProviderLayout />}>
        <Route path="provider" element={<ProviderInbox />} />
        <Route path="provider/tasks/:taskId" element={<ProviderTaskDetail />} />
      </Route>
    </Route>

    <Route element={<ProtectedRoute staffOnly adminOnly />}>
      <Route element={<AdminLayout />}>
        <Route path="admin" element={<AdminDashboard />} />
        <Route path="admin/users" element={<AdminUsers />} />
        <Route path="admin/reports" element={<Reports />} />
      </Route>
    </Route>

    <Route element={<ProtectedRoute staffOnly excludeAdmin />}>
    <Route element={<WorkspaceLayout />}>
      <Route index element={<Dashboard />} />
      <Route path="clients" element={<Clients />} />
      <Route path="client-pulse" element={<ClientPulse />} />
      <Route path="client-pulse/:clientId" element={<ClientPulseDetail />} />
      <Route path="reminders" element={<Reminders />} />
      <Route path="workspace" element={<Navigate to="/reminders" replace />} />
      <Route path="clients/new" element={<Navigate to="/clients?add=1" replace />} />
      <Route path="clients/:id" element={<ClientProfile />} />
      <Route path="clients/:id/edit" element={<ClientForm />} />
      <Route path="compliance" element={<Compliance />} />
      <Route path="compliance/:adviserId" element={<AdviserCompliance />} />
      <Route path="reports" element={<Reports />} />
      <Route path="tasks" element={<Tasks />} />
      <Route path="tasks/new" element={<NewRequest staff />} />
      <Route path="tasks/:taskId" element={<AdviserTaskDetail />} />
      <Route path="*" element={<div className="card"><h1>Page not found</h1><Link to="/">Return to your clients</Link></div>} />
    </Route>
    </Route>
  </Routes></AuthProvider></BrowserRouter>
}
