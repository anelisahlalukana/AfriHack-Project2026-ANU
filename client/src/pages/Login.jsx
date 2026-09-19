import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const { session, loading, error: authError } = useAuth()
  const location = useLocation()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const from = location.state?.from
  if (loading) return <p className="loading" role="status">Restoring your session…</p>
  if (session) return <Navigate to={from?.startsWith('/') && !from.startsWith('//') && from !== '/login' ? from : '/'} replace />
  async function login(event) {
    event.preventDefault(); setBusy(true); setError('')
    const data = new FormData(event.currentTarget)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: data.get('email').trim(), password: data.get('password') })
      if (error) throw error
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  return <div className="login-page"><section className="login-story"><img src="/images/logo.jpg" alt="Royal Square Financial" /><p className="eyebrow">PERSONAL ADVICE. LASTING IMPACT.</p><h1>A clearer picture.<br />A stronger financial future.</h1><p>Bring your clients, their priorities, and their financial plans together in one place.</p></section>
    <section className="login-panel"><form className="card" onSubmit={login}><p className="eyebrow">YOUR ADVISOR WORKSPACE</p><h2>Welcome back</h2><p>Sign in to support your clients’ next chapter.</p>
      {!supabase && <p className="error" role="alert">Connect Supabase to get started. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in client/.env.local, then restart the app.</p>}
      <label>Email address<input name="email" type="email" autoComplete="username" required disabled={!supabase} /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required disabled={!supabase} /></label>
      {(error || authError) && <p className="error" role="alert">{error || authError}</p>}
      <button className="primary" disabled={busy || !supabase}>{busy ? 'Signing in…' : 'Sign in'}</button><small>Use the advisor account provided by your administrator.</small>
    </form></section></div>
}
