import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ProtectedRoute from '../../src/components/ProtectedRoute'
import { AuthContext } from '../../src/hooks/useAuth'

afterEach(cleanup)

const userWithRole = role => ({ user: { id: `${role}-1`, app_metadata: role ? { role } : {} } })

function LoginProbe() {
  const { state } = useLocation()
  return <p>login page (from: {state?.from ?? 'none'})</p>
}

// Mounts ProtectedRoute the way App.jsx does. Every place it can redirect to is an
// unguarded landing page, so a wrong redirect shows up as the wrong text rather than a loop.
function renderAt(path, auth, guardProps = {}) {
  return render(
    <AuthContext.Provider value={{ loading: false, session: null, ...auth }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route path="/" element={<p>advisor home</p>} />
          <Route path="/account" element={<p>client home</p>} />
          <Route path="/admin" element={<p>admin home</p>} />
          <Route path="/provider" element={<p>provider home</p>} />
          <Route element={<ProtectedRoute {...guardProps} />}>
            <Route path="/clients/:id" element={<p>client profile</p>} />
            <Route path="/secret" element={<p>secret page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('ProtectedRoute', () => {
  it('shows a loading state, not the page or a redirect, while the session is restored', () => {
    renderAt('/secret', { loading: true }, { staffOnly: true })
    expect(screen.getByRole('status').textContent).toMatch(/loading/i)
    expect(screen.queryByText('secret page')).toBeNull()
    expect(screen.queryByText(/login page/)).toBeNull()
  })

  it('sends signed-out visitors to /login and remembers where they were going', () => {
    renderAt('/clients/42?tab=goals#form', { session: null })
    expect(screen.getByText('login page (from: /clients/42?tab=goals#form)')).toBeTruthy()
    expect(screen.queryByText('client profile')).toBeNull()
  })

  it('lets an advisor into staff pages', () => {
    renderAt('/secret', { session: userWithRole('advisor') }, { staffOnly: true, excludeAdmin: true })
    expect(screen.getByText('secret page')).toBeTruthy()
  })

  it('keeps clients out of staff pages and sends them to their own home', () => {
    renderAt('/secret', { session: userWithRole(null) }, { staffOnly: true })
    expect(screen.getByText('client home')).toBeTruthy()
    expect(screen.queryByText('secret page')).toBeNull()
  })

  it('does not trust a role claimed in editable user_metadata', () => {
    const session = { user: { id: 'sneaky', app_metadata: {}, user_metadata: { role: 'admin' } } }
    renderAt('/secret', { session }, { staffOnly: true, adminOnly: true })
    expect(screen.getByText('client home')).toBeTruthy()
    expect(screen.queryByText('secret page')).toBeNull()
  })

  it('keeps admins out of the advisor workspace and sends them to /admin', () => {
    renderAt('/secret', { session: userWithRole('admin') }, { staffOnly: true, excludeAdmin: true })
    expect(screen.getByText('admin home')).toBeTruthy()
    expect(screen.queryByText('secret page')).toBeNull()
  })

  it('lets only admins into admin-only pages', () => {
    renderAt('/secret', { session: userWithRole('admin') }, { staffOnly: true, adminOnly: true })
    expect(screen.getByText('secret page')).toBeTruthy()
    cleanup()
    renderAt('/secret', { session: userWithRole('advisor') }, { staffOnly: true, adminOnly: true })
    expect(screen.getByText('advisor home')).toBeTruthy()
    expect(screen.queryByText('secret page')).toBeNull()
  })

  it('confines provider logins to the provider portal, and only they may open it', () => {
    renderAt('/secret', { session: userWithRole('provider') }, { staffOnly: true })
    expect(screen.getByText('provider home')).toBeTruthy()
    cleanup()
    renderAt('/secret', { session: userWithRole('provider') }, { providerOnly: true })
    expect(screen.getByText('secret page')).toBeTruthy()
    cleanup()
    renderAt('/secret', { session: userWithRole('advisor') }, { providerOnly: true })
    expect(screen.getByText('advisor home')).toBeTruthy()
    expect(screen.queryByText('secret page')).toBeNull()
  })
})
