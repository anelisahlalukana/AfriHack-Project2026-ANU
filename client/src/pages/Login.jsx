import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { loginDestination } from '../lib/authRoles'

export default function Login() {
  const { session, loading, error: authError, signIn, configured } = useAuth()
  const location = useLocation()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <p className="loading" role="status">Restoring your session…</p>
  if (session) return <Navigate to={loginDestination(session.user, location.state?.from)} replace />

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const data = new FormData(event.currentTarget)
    try {
      await signIn(data.get('email'), data.get('password'))
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }

  return <div className="login-page">
    <section className="login-story">
      <img className="login-slogan" src="/images/slogan.png" alt="Royal Square Financial" />
      <p className="eyebrow">PERSONAL ADVICE. LASTING IMPACT.</p>
      <h1>A clearer picture.<br />A stronger financial future.</h1>
      <p>Your financial journey, connected in one place.</p>
    </section>
    <section className="login-panel">
      <form className="card" onSubmit={submit}>
        <p className="eyebrow">ROYAL SQUARE FINANCIAL</p>
        <h2>Welcome back</h2>
        <p>Clients and advisers can sign in here.</p>
        {!configured && <p className="error" role="alert">Sign-in is currently unavailable. Please contact your administrator.</p>}
        <label>Email address<input name="email" type="email" autoComplete="username" required disabled={busy || !configured} /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required disabled={busy || !configured} /></label>
        {(error || authError) && <p className="error" role="alert">{error || authError}</p>}
        <button className="primary" disabled={busy || !configured}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <small>New client? Your adviser will email you an invitation to register. Advisers and admins: sign in with your administrator-provided account.</small>
      </form>
    </section>
  </div>
}
