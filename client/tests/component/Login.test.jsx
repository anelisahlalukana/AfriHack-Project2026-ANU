import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Login from '../../src/pages/Login'
import { AuthContext } from '../../src/hooks/useAuth'

afterEach(cleanup)

const ID_NUMBER = '9001015800085'

function renderLogin(auth = {}, entry = '/login') {
  const value = {
    session: null,
    loading: false,
    error: '',
    configured: true,
    signIn: vi.fn(),
    signInWithIdNumber: vi.fn(),
    signOut: vi.fn(),
    ...auth,
  }
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<p>advisor home</p>} />
          <Route path="/account" element={<p>client home</p>} />
          <Route path="/clients/:id" element={<p>client profile</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return value
}

function submit(username, password = 'correct-horse') {
  fireEvent.change(document.querySelector('input[name="username"]'), { target: { value: username } })
  fireEvent.change(document.querySelector('input[name="password"]'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('Login page', () => {
  it('rejects a malformed username before calling the server', async () => {
    const auth = renderLogin()
    submit('12345')
    expect((await screen.findByRole('alert')).textContent).toMatch(/exactly 13 digits/)
    expect(auth.signIn).not.toHaveBeenCalled()
    expect(auth.signInWithIdNumber).not.toHaveBeenCalled()
  })

  it('signs clients in by ID number', async () => {
    const auth = renderLogin({ signInWithIdNumber: vi.fn().mockResolvedValue({}) })
    submit(ID_NUMBER)
    await waitFor(() => expect(auth.signInWithIdNumber).toHaveBeenCalledWith(ID_NUMBER, 'correct-horse'))
    expect(auth.signIn).not.toHaveBeenCalled()
  })

  it('signs staff in by email', async () => {
    const auth = renderLogin({ signIn: vi.fn().mockResolvedValue({ user: { app_metadata: { role: 'advisor' } } }) })
    submit('  adviser@example.com ')
    await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith('adviser@example.com', 'correct-horse'))
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('signs a client out again if they tried an email address', async () => {
    const auth = renderLogin({
      signIn: vi.fn().mockResolvedValue({ user: { app_metadata: {} } }),
      signOut: vi.fn().mockResolvedValue(undefined),
    })
    submit('client@example.com')
    expect((await screen.findByRole('alert')).textContent).toMatch(/13-digit ID number, not an email/)
    expect(auth.signOut).toHaveBeenCalledOnce()
  })

  it('shows the error when sign-in fails', async () => {
    renderLogin({ signInWithIdNumber: vi.fn().mockRejectedValue(new Error('Invalid login credentials')) })
    submit(ID_NUMBER)
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid login credentials')
  })

  it('disables the form and explains why when Supabase is not configured', () => {
    renderLogin({ configured: false })
    expect(screen.getByRole('alert').textContent).toMatch(/currently unavailable/)
    expect(screen.getByRole('button', { name: 'Sign in' }).disabled).toBe(true)
  })

  it('waits for the session to be restored instead of flashing the form', () => {
    renderLogin({ loading: true })
    expect(screen.getByRole('status').textContent).toMatch(/restoring/i)
    expect(document.querySelector('form')).toBeNull()
  })

  it('redirects a signed-in user to where they were headed, or to their home', () => {
    const advisor = { user: { app_metadata: { role: 'advisor' } } }
    renderLogin({ session: advisor }, { pathname: '/login', state: { from: '/clients/7' } })
    expect(screen.getByText('client profile')).toBeTruthy()
    cleanup()
    renderLogin({ session: advisor })
    expect(screen.getByText('advisor home')).toBeTruthy()
    cleanup()
    renderLogin({ session: { user: { app_metadata: {} } } })
    expect(screen.getByText('client home')).toBeTruthy()
  })
})
