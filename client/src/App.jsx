import { useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, LogOut, Plus, ShieldCheck } from 'lucide-react'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabaseClient'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ClientProfile from './pages/ClientProfile'
import ClientForm from './pages/ClientForm'
import './App.css'

function ProtectedLayout() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  if (loading) return <div className="loading" role="status">Loading your workspace…</div>
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  async function logout() {
    setSigningOut(true); setError('')
    try { const { error } = await supabase.auth.signOut(); if (error) throw error }
    catch (error) { setError(error.message) }
    finally { setSigningOut(false) }
  }
  return <div className="app-shell">
    <aside><Link className="brand" to="/"><img src="/images/logo.jpg" alt="Royal Square Financial" /></Link>
      <p className="eyebrow">ADVISOR WORKSPACE</p>
      <nav><Link to="/"><LayoutDashboard size={18} /> Client overview</Link><Link to="/clients/new"><Plus size={18} /> Onboard a client</Link></nav>
      <div className="advisor"><ShieldCheck size={22} /><span>{session.user.email}</span><button onClick={logout} disabled={signingOut}><LogOut size={16} /> {signingOut ? 'Signing out…' : 'Sign out'}</button>{error && <p role="alert" className="error">{error}</p>}</div>
    </aside>
    <main key={session.user.id}><div className="workspace-label">ROYAL SQUARE FINANCIAL <span>Client management</span></div><Outlet /></main>
  </div>
}
export default function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<ProtectedLayout />}>
      <Route index element={<Dashboard />} />
      <Route path="clients/new" element={<ClientForm />} />
      <Route path="clients/:id" element={<ClientProfile />} />
      <Route path="clients/:id/edit" element={<ClientForm />} />
      <Route path="*" element={<div className="card"><h1>Page not found</h1><Link to="/">Return to your clients</Link></div>} />
    </Route>
  </Routes></AuthProvider></BrowserRouter>
}
