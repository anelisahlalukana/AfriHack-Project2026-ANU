import { useEffect, useState } from 'react'
import { getDashboard } from '../api/dashboard'

const REFRESH_MS = 15000

// The advisor dashboard, kept live: loads once, re-checks every 15 seconds while the tab is
// showing, and straight away when the tab comes back into view. If a refresh fails it keeps the
// last good numbers on screen and reports the error, so a blip never blanks the page.
export function useDashboard() {
  const [state, setState] = useState({ data: null, error: '' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    getDashboard()
      .then(data => { if (active) setState({ data, error: '' }) })
      .catch(error => { if (active) setState(current => ({ ...current, error: error.message })) })
    return () => { active = false }
  }, [reloadKey])

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') setReloadKey(key => key + 1) }
    const timer = setInterval(refresh, REFRESH_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [])

  return { ...state, refresh: () => setReloadKey(key => key + 1) }
}
