import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Inbox, LogOut } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useProviderMe } from '../../hooks/useProvider'
import { initialsOf } from '../../lib/initials'

// Shell for insurer and product-provider logins. Shows which organisation the login
// belongs to; pages get it from the outlet context as { me }.
export default function ProviderLayout() {
  const { session, signOut } = useAuth()
  const me = useProviderMe()
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const name = session.user.user_metadata?.full_name || session.user.email

  async function logout() {
    setSigningOut(true); setError('')
    try { await signOut() }
    catch (error) { setError(error.message) }
    finally { setSigningOut(false) }
  }

  let body
  if (me.loading) body = <p role="status">Loading your portal…</p>
  else if (me.error) body = <section className="card" role="alert"><p className="eyebrow">PROVIDER PORTAL</p><h1>We couldn't open your portal</h1><p className="error">{me.error}</p><button onClick={me.retry}>Try again</button></section>
  else body = <Outlet context={{ me: me.data }} />

  return <div className="app-shell">
    <aside>
      <Link className="side-logo" to="/provider"><img src="/images/slogan.png" alt="Royal Square Financial" /></Link>
      <p className="eyebrow">{me.data ? me.data.provider.name.toUpperCase() : 'PROVIDER PORTAL'}</p>
      <hr className="side-divider" />
      <nav>
        <NavLink to="/provider" end><Inbox size={18} /> Claims & requests</NavLink>
      </nav>
      <div className="advisor">
        <div className="side-user">
          <span className="side-avatar" aria-hidden="true">{initialsOf(name)}</span>
          <span className="side-user-text"><strong title={name}>{name}</strong><small>Provider</small></span>
        </div>
        <button onClick={logout} disabled={signingOut}><LogOut size={16} /> {signingOut ? 'Signing out…' : 'Sign out'}</button>
        {error && <p role="alert" className="error">{error}</p>}
      </div>
    </aside>
    <main key={session.user.id}>
      <div className="workspace-label">ROYAL SQUARE FINANCIAL <span>Provider portal{me.data ? ` · ${me.data.provider.name}` : ''}</span></div>
      {body}
    </main>
  </div>
}
