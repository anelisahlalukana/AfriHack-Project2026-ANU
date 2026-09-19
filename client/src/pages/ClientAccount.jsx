import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { isStaff, accountHome } from '../lib/authRoles'

export default function ClientAccount() {
  const { user, signOut } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function logout() {
    setBusy(true)
    try { await signOut() }
    catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  return <main className="account-page"><section className="card">
    <img src="/images/slogan.png" alt="Royal Square Financial" />
    <p className="eyebrow">YOUR ACCOUNT</p>
    <h1>Welcome{user.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}</h1>
    <p>You are signed in as {user.email}.</p>
    {isStaff(user) ? <Link className="button primary" to={accountHome(user)}>Open your workspace</Link> : <p>Your client account is ready. Contact your adviser to arrange your financial needs analysis.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <button onClick={logout} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button>
  </section></main>
}
