import { useEffect, useState } from 'react'
import { getClient, listClients } from '../api/clients'
export function useClients(id) {
  const [state, setState] = useState({ data: null, loading: true, error: '' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    const request = id ? getClient(id) : listClients()
    request.then(data => { if (active) setState({ data, loading: false, error: '' }) })
      .catch(error => { if (active) setState({ data: null, loading: false, error: error.message }) })
    return () => { active = false }
  }, [id, attempt])
  return { ...state, retry: () => { setState({ data: null, loading: true, error: '' }); setAttempt(value => value + 1) } }
}
