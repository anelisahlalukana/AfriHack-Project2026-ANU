import { useEffect, useState } from 'react'
import { Mail, UserPlus, Users } from 'lucide-react'
import { listStaffUsers, createStaffUser, resendStaffInvite } from '../../api/users'
import { getCatalog } from '../../api/tasks'

const ROLES = [
  { value: 'advisor', label: 'Advisor' },
  { value: 'admin', label: 'Admin' },
  { value: 'provider', label: 'Provider (insurer portal)' },
]

export default function AdminUsers() {
  const [users, setUsers] = useState(null)
  const [listError, setListError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [resendingId, setResendingId] = useState(null)
  const [resendError, setResendError] = useState('')
  const [resendNotice, setResendNotice] = useState('')
  const [role, setRole] = useState('advisor')
  const [providers, setProviders] = useState(null)
  const [providersError, setProvidersError] = useState('')

  // Provider organisations (Santam, Old Mutual, ...) for provider logins.
  useEffect(() => {
    if (role !== 'provider' || providers) return undefined
    let active = true
    getCatalog()
      .then(data => { if (active) { setProviders(data.providers); setProvidersError('') } })
      .catch(error => { if (active) setProvidersError(error.message) })
    return () => { active = false }
  }, [role, providers])

  useEffect(() => {
    let active = true
    listStaffUsers()
      .then(data => { if (active) { setUsers(data); setListError('') } })
      .catch(error => { if (active) setListError(error.message) })
    return () => { active = false }
  }, [reloadKey])

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setFormError('')
    setNotice('')
    const form = event.currentTarget
    const data = new FormData(form)
    try {
      await createStaffUser({
        email: data.get('email').trim(),
        fullName: data.get('full_name').trim(),
        role: data.get('role'),
        providerId: data.get('role') === 'provider' ? data.get('provider_id') : undefined,
      })
      setNotice('Account created. An email with a password-setup link has been sent.')
      form.reset()
      setRole('advisor')
      setReloadKey(value => value + 1)
    } catch (error) {
      setFormError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function resend(user) {
    setResendingId(user.id)
    setResendError('')
    setResendNotice('')
    try {
      await resendStaffInvite(user.id)
      setResendNotice(`A new password link has been sent to ${user.email}. Any earlier link no longer works.`)
    } catch (error) {
      setResendError(error.message)
    } finally {
      setResendingId(null)
    }
  }

  return <>
    <header className="page-heading">
      <div>
        <h1>Staff and provider accounts</h1>
        <p>Create logins for advisers, admins and insurers — they don't self-register.</p>
      </div>
    </header>

    <section className="card">
      <header className="section-heading">
        <div><h2><UserPlus size={20} /> Add a new user</h2><p>They'll receive an email with a link to set their password.</p></div>
      </header>
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <label>Full name<input name="full_name" autoComplete="name" required disabled={busy} /></label>
          <label>Email address<input name="email" type="email" autoComplete="email" required disabled={busy} /></label>
          <label>Role<select name="role" value={role} onChange={event => setRole(event.target.value)} required disabled={busy}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select></label>
          {role === 'provider' && <label>Provider<select name="provider_id" defaultValue="" required disabled={busy || !providers}>
            <option value="" disabled>{providers ? 'Choose the insurer…' : 'Loading…'}</option>
            {providers?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>}
        </div>
        {role === 'provider' && <p className="muted">Provider logins open the provider portal and only see the claims and requests sent to that insurer.</p>}
        {providersError && <p className="error" role="alert">{providersError}</p>}
        {formError && <p className="error" role="alert">{formError}</p>}
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        <div className="form-actions">
          <button className="primary" disabled={busy}>{busy ? 'Adding user…' : 'Add new user and send email'}</button>
        </div>
      </form>
    </section>

    <section className="card">
      <header className="section-heading"><div><h2><Users size={20} /> Existing accounts</h2></div></header>
      {listError && <p className="error" role="alert">{listError}</p>}
      {!users && !listError && <p>Loading…</p>}
      {users && !users.length && <p className="empty">No staff accounts yet.</p>}
      {resendError && <p className="error" role="alert">{resendError}</p>}
      {resendNotice && <p className="auth-notice" role="status">{resendNotice}</p>}
      {users && users.length > 0 && <div className="table-scroll"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th><th>Password link</th></tr></thead>
        <tbody>{users.map(u => <tr key={u.id}>
          <td>{u.fullName || '—'}</td>
          <td>{u.email}</td>
          <td><span className="badge">{u.role}</span>{u.organisation && <small className="muted"> {u.organisation}</small>}</td>
          <td>{new Date(u.createdAt).toLocaleDateString()}</td>
          <td><button className="button" onClick={() => resend(u)} disabled={resendingId !== null} aria-label={`Resend password link to ${u.email}`}>
            <Mail size={16} /> {resendingId === u.id ? 'Sending…' : 'Resend link'}
          </button></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>
}
