import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'
import { loginDestination } from '../lib/authRoles'

// Supabase reports a bad link (expired, already used) in the URL hash or query
// string, e.g. #error_code=otp_expired&error_description=Email+link+is+invalid...
function readLinkError() {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const query = new URLSearchParams(window.location.search)
  return hash.get('error_description') || query.get('error_description') || ''
}

// Landing page for the emailed Supabase recovery link (admin-created staff
// accounts, and regular "forgot password" flows). Supabase establishes a
// session from the link before this renders, so useAuth().session is set.
export default function ResetPassword() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [linkError] = useState(readLinkError)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <p className="loading" role="status">Loading…</p>
  if (!session) return <div className="login-page">
    <section className="login-story">
      <p className="eyebrow">ROYAL SQUARE FINANCIAL</p>
      <h1>Link not valid</h1>
      <p>We couldn't verify your password link.</p>
    </section>
    <section className="login-panel">
      <div className="card">
        <p className="eyebrow">ACCOUNT SETUP</p>
        <h2>This link can't be used</h2>
        <p className="error" role="alert">{linkError || 'The link is missing, has expired, or was already used.'}</p>
        <p>Password links work once. If it was opened before (some email apps preview links automatically), ask your administrator to send a new one.</p>
        <Link to="/login">Back to sign in</Link>
      </div>
    </section>
  </div>

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = event.currentTarget
    const data = new FormData(form)
    const password = data.get('password')
    const confirmPassword = data.get('confirm_password')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      setBusy(false)
      return
    }

    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      navigate(loginDestination(session.user), { replace: true })
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return <div className="login-page">
    <section className="login-story">
      <p className="eyebrow">ROYAL SQUARE FINANCIAL</p>
      <h1>Set your password</h1>
      <p>Choose a password for your account to finish setting it up.</p>
    </section>
    <section className="login-panel">
      <form className="card" onSubmit={submit}>
        <p className="eyebrow">ACCOUNT SETUP</p>
        <h2>Set a new password</h2>
        <label>New password<input name="password" type="password" autoComplete="new-password" minLength={8} required disabled={busy} /><small>Use at least 8 characters.</small></label>
        <label>Confirm password<input name="confirm_password" type="password" autoComplete="new-password" minLength={8} required disabled={busy} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Set password and continue'}</button>
      </form>
    </section>
  </div>
}
