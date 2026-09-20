import { useCallback, useEffect, useState } from 'react'
import { getMyOverview } from '../api/dashboard'

export const REFRESH_MS = 15000

// The client's dashboard, kept live: loads once, re-checks every 15 seconds while the tab is
// showing, and straight away when the tab comes back into view. This matters more here than on
// the adviser side, because the things on this page (a document arriving, a claim moving to the
// next stage) are usually set off by somebody else while the client is looking at it. A failed
// refresh keeps the last good data on screen and reports the error, so a blip never blanks it.
export function useClientOverview(enabled = true) {
  const [state, setState] = useState({ data: null, error: '' })
  const [reloadKey, setReloadKey] = useState(0)
  const refresh = useCallback(() => setReloadKey(key => key + 1), [])

  useEffect(() => {
    if (!enabled) return
    let active = true
    getMyOverview()
      .then(data => { if (active) setState({ data, error: '' }) })
      .catch(error => { if (active) setState(current => ({ ...current, error: error.message })) })
    return () => { active = false }
  }, [enabled, reloadKey])

  useEffect(() => {
    if (!enabled) return
    const recheck = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = setInterval(recheck, REFRESH_MS)
    document.addEventListener('visibilitychange', recheck)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', recheck) }
  }, [enabled, refresh])

  return { ...state, refresh }
}
