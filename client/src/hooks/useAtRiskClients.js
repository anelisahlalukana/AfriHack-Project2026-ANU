import { useEffect, useState } from 'react'
import { getAtRiskClients, getClientPulse } from '../api/dashboard'
import { REFRESH_MS } from './useDashboard'

// Client Pulse, kept live the same way as useDashboard: loads once, re-checks every 15 seconds while
// the tab is showing, and straight away when the tab comes back into view. If a refresh fails it
// keeps the last good data on screen and reports the error, so a blip never blanks the page.
export function useAtRiskClients() {
  const [state, setState] = useState({ data: null, error: '' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    getAtRiskClients()
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

// The drill-down for one client, with the same live behaviour. Data left over from another
// client is never shown: it is tagged with the client it belongs to.
export function useClientPulse(clientId) {
  const [state, setState] = useState({ clientId, data: null, error: '' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    getClientPulse(clientId)
      .then(data => { if (active) setState({ clientId, data, error: '' }) })
      .catch(error => {
        if (active) setState(current => ({ clientId, data: current.clientId === clientId ? current.data : null, error: error.message }))
      })
    return () => { active = false }
  }, [clientId, reloadKey])

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') setReloadKey(key => key + 1) }
    const timer = setInterval(refresh, REFRESH_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [])

  const current = state.clientId === clientId ? state : { data: null, error: '' }
  return { data: current.data, error: current.error, refresh: () => setReloadKey(key => key + 1) }
}
