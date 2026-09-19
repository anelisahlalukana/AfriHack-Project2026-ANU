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
      if (active) { setSession(next); setLoading(false) }
    })
    supabase.auth.getSession().then(({ data, error }) => {
      if (active && !changed) {
        setSession(data.session)
        setError(error?.message || '')
        setLoading(false)
      }
    }).catch(error => { if (active) { setError(error.message); setLoading(false) } })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  return <AuthContext.Provider value={{ session, loading, error }}>{children}</AuthContext.Provider>
}
