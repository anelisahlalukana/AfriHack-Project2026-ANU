import { useState } from 'react'
import ThemeToggle from '../components/ThemeToggle'
import PasswordField from '../components/PasswordField'
import { Navigate, useLocation } from 'react-router-dom'
import { Info } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { loginDestination, isStaff, isProvider } from '../lib/authRoles'
import { parseUsername } from '../lib/loginIdentifier'

const USERNAME_HINT = 'Advisers, admins and insurers: your email address. Clients: your 13-digit ID number.'

export default function Login() {
  const { session, loading, error: authError, signIn, signInWithIdNumber, signOut, configured } = useAuth()
  const location = useLocation()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <p className="loading" role="status">Restoring your session…</p>
  // Wait for the sign-in to finish (busy) so a client who signs in by email, which we
  // don't allow, isn't briefly redirected into /account before being signed out.
  if (session && !busy) return <Navigate to={loginDestination(session.user, location.state?.from)} replace />

  async function submit(event) {
    event.preventDefault()
    setError('')
    const data = new FormData(event.currentTarget)
    const username = parseUsername(data.get('username'))

    if (username.error) {
      setError(username.error)
      return
    }

    setBusy(true)
    try {
      if (username.kind === 'id') {
        await signInWithIdNumber(username.value, data.get('password'))
      } else {
        const next = await signIn(username.value, data.get('password'))
        if (!isStaff(next.user) && !isProvider(next.user)) {
          await signOut()
          throw new Error('Clients sign in with their 13-digit ID number, not an email address.')
        }
      }
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }

  return <div className="login-page">
    <ThemeToggle className="login-theme-toggle" />
    <section className="login-story">
      <img className="login-slogan" src="/images/slogan.png" alt="Royal Square Financial" />
      <p className="eyebrow">PERSONAL ADVICE. LASTING IMPACT.</p>
      <h1>A clearer picture.<br />A stronger financial future.</h1>
      <p>Your financial journey, connected in one place.</p>
    </section>
    <section className="login-panel">
      <form className="card" onSubmit={submit} noValidate>
        <p className="eyebrow">ROYAL SQUARE FINANCIAL</p>
        <h2>Welcome back</h2>
        <p>Clients, advisers and insurers can sign in here.</p>
        {!configured && <p className="error" role="alert">Sign-in is currently unavailable. Please contact your administrator.</p>}
        <label><span className="label-row">Username<span className="tip" tabIndex={0} role="img" aria-label={USERNAME_HINT} data-tip={USERNAME_HINT}><Info size={15} /></span></span><input name="username" autoComplete="username" autoCapitalize="none" spellCheck="false" required disabled={busy || !configured} /></label>
        <PasswordField label="Password" name="password" autoComplete="current-password" required disabled={busy || !configured} />
        {(error || authError) && <p className="error" role="alert">{error || authError}</p>}
        <button className="primary" disabled={busy || !configured}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <small>New client? Your adviser will email you an invitation to register.</small>
      </form>
    </section>
  </div>
}
