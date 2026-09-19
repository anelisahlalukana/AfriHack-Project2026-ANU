import { useState } from "react";
import Brand from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { loginDestination } from "../lib/authRoles";

export default function Login({ signup = false }) {
  const {
    session,
    loading,
    error: authError,
    signIn,
    signUp,
    configured,
  } = useAuth();
  const location = useLocation();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading)
    return (
      <p className="loading" role="status">
        Restoring your session…
      </p>
    );
  if (session)
    return (
      <Navigate
        to={loginDestination(session.user, location.state?.from)}
        replace
      />
    );

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      if (signup) {
        if (!data.get("full_name").trim())
          throw new Error("Please enter your full name.");
        if (data.get("password") !== data.get("confirm_password"))
          throw new Error("Passwords do not match.");
        const result = await signUp(
          data.get("email"),
          data.get("password"),
          data.get("full_name"),
        );
        if (!result.session) {
          setNotice(
            "Check your email for a confirmation link before signing in. If you already have an account, sign in with your existing password.",
          );
          form.reset();
        }
      } else {
        await signIn(data.get("email"), data.get("password"));
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-story">
        <Brand />
        <p className="eyebrow">PERSONAL ADVICE. LASTING IMPACT.</p>
        <h1>
          A clearer picture.
          <br />A stronger financial future.
        </h1>
        <p>Your financial journey, connected in one place.</p>
      </section>
      <section className="login-panel">
        <div className="login-theme">
          <ThemeToggle />
        </div>
        <form className="card" onSubmit={submit}>
          <p className="eyebrow">
            {signup ? "CLIENT REGISTRATION" : "ROYAL SQUARE FINANCIAL"}
          </p>
          <h2>{signup ? "Create your client account" : "Welcome back"}</h2>
          <p>
            {signup
              ? "Start by creating your secure client login."
              : "Clients and Royal Square advisers can sign in here."}
          </p>
          {!configured && (
            <p className="error" role="alert">
              Sign-in is currently unavailable. Please contact your
              administrator.
            </p>
          )}
          {signup && (
            <label>
              Full name
              <input
                name="full_name"
                autoComplete="name"
                required
                disabled={busy || !configured}
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              disabled={busy || !configured}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={signup ? 8 : undefined}
              required
              disabled={busy || !configured}
            />
            {signup && <small>Use at least 8 characters.</small>}
          </label>
          {signup && (
            <label>
              Confirm password
              <input
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                disabled={busy || !configured}
              />
            </label>
          )}
          {(error || authError) && (
            <p className="error" role="alert">
              {error || authError}
            </p>
          )}
          {notice && (
            <p className="auth-notice" role="status">
              {notice}
            </p>
          )}
          <button className="primary" disabled={busy || !configured}>
            {busy
              ? signup
                ? "Creating account…"
                : "Signing in…"
              : signup
                ? "Create client account"
                : "Sign in"}
          </button>
          <p className="auth-switch">
            {signup ? (
              <>
                Already have an account? <Link to="/login">Sign in</Link>
              </>
            ) : (
              <>
                New client? <Link to="/signup">Create an account</Link>
              </>
            )}
          </p>
          <small>
            Advisers: use your Royal Square account. Registration is for clients
            only.
          </small>
        </form>
      </section>
    </div>
  );
}
