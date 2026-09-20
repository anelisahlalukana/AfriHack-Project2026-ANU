import { useState } from 'react'
import ThemeToggle from '../../components/ThemeToggle'
import PasswordField from '../../components/PasswordField'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { completeRegistration, finishRegistration } from '../../api/clients'
import { supabase } from '../../lib/supabaseClient'
import { loginDestination } from '../../lib/authRoles'

// Reached from the invitation email an adviser triggers when adding a client.
// Step A: ID number + new password (server saves them and emails a code).
// Step B: the client types that code; verifying it confirms their email and
// signs them in, so they land on their account without a second login.
export default function CompleteRegistration() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState(params.get('email') || '')
  const [step, setStep] = useState('details')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submitDetails(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const data = new FormData(event.currentTarget)
    const password = data.get('password')

    if (password !== data.get('confirm_password')) {
      setError('Passwords do not match.')
      setBusy(false)
      return
    }

    const address = (data.get('email') || email).trim()

    try {
      await completeRegistration({ email: address, idNumber: data.get('id_number').trim(), password })
      setEmail(address)
      setStep('code')
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const data = new FormData(event.currentTarget)

    try {
      const { data: result, error } = await supabase.auth.verifyOtp({
        email,
        token: data.get('code').trim(),
        type: 'email',
      })
      if (error) throw error
      if (!result.session) throw new Error('Verification did not return a session. Please try again.')
      // Their day-one documents are sent now. If that fails they still get in; an adviser
      // can send the documents later, so this must never block the redirect.
      await finishRegistration().catch(() => {})
      navigate(loginDestination(result.session.user), { replace: true })
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return <div className="login-page">
    <ThemeToggle className="login-theme-toggle" />
    <section className="login-story">
      <img className="login-slogan" src="/images/slogan.png" alt="Royal Square Financial" />
      <p className="eyebrow">CLIENT REGISTRATION</p>
      <h1>{step === 'details' ? 'Finish setting up your account' : 'Check your email'}</h1>
      <p>{step === 'details'
        ? 'Your adviser has added you as a client. Confirm your ID number and choose a password.'
        : 'We sent a verification code to your email address. Enter it to activate your account.'}</p>
    </section>
    <section className="login-panel">
      {step === 'details' && <form className="card" onSubmit={submitDetails}>
        <p className="eyebrow">STEP 1 OF 2</p>
        <h2>Complete your registration</h2>
        {!params.get('email') && <label>Email address<input name="email" type="email" autoComplete="username" required disabled={busy} value={email} onChange={event => setEmail(event.target.value)} /></label>}
        {params.get('email') && <p>Registering <b>{email}</b></p>}
        <label>ID number<input name="id_number" inputMode="numeric" autoComplete="off" pattern="[0-9]{13}" maxLength={13} title="Your ID number must be exactly 13 digits" required disabled={busy} /><small>13 digits. You'll use this to sign in.</small></label>
        <PasswordField label="New password" hint="Use at least 8 characters." name="password" autoComplete="new-password" minLength={8} maxLength={72} required disabled={busy} />
        <PasswordField label="Confirm password" name="confirm_password" autoComplete="new-password" minLength={8} maxLength={72} required disabled={busy} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button>
        <p className="auth-switch">Already registered? <Link to="/login">Sign in</Link></p>
      </form>}
      {step === 'code' && <form className="card" onSubmit={submitCode}>
        <p className="eyebrow">STEP 2 OF 2</p>
        <h2>Enter your verification code</h2>
        <p>We emailed a code to <b>{email}</b>.</p>
        <label>Verification code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required disabled={busy} autoFocus /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Verifying and setting up…' : 'Verify and continue'}</button>
        <p className="auth-switch">Didn't get it? <button type="button" className="link" onClick={() => { setError(''); setStep('details') }}>Go back and request a new code</button></p>
      </form>}
    </section>
  </div>
}
