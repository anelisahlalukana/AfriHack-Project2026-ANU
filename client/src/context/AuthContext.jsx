import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { AuthContext } from '../hooks/useAuth'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) return
    let active = true
    let changed = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      changed = true
      if (active) {
        setSession(next)
        setError('')
        setLoading(false)
      }
    })
    supabase.auth.getSession().then(({ data, error }) => {
      if (active && !changed) {
        setSession(data.session)
        setError(error?.message || '')
        setLoading(false)
      }
    }).catch(error => {
      if (active && !changed) {
        setError(error.message)
        setLoading(false)
      }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  async function signIn(email, password) {
    if (!supabase) throw new Error('Supabase authentication is not configured.')
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
    if (!data.session) throw new Error('Sign-in did not return a session. Please try again.')
    setSession(data.session)
  }

  async function signUp(email, password, fullName) {
    if (!supabase) throw new Error('Supabase authentication is not configured.')
    setError('')
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    if (error) throw error
    // No role is accepted from the browser. Unprovisioned accounts are clients.
    if (data.session) setSession(data.session)
    return data
  }

  async function signOut() {
    if (!supabase) throw new Error('Supabase authentication is not configured.')
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setSession(null)
    setError('')
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, error, signIn, signUp, signOut, configured: Boolean(supabase) }}>
      {children}
    </AuthContext.Provider>
  )
}
