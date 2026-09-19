import { useEffect, useState } from 'react'
import { getClient, listClients } from '../api/clients'

export function useClients(id) {
  const key = id || 'all-clients'
  const [state, setState] = useState({ key: null, data: null, loading: true, error: '' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    const request = id ? getClient(id) : listClients()
    request.then(data => {
      if (active) setState({ key, data, loading: false, error: '' })
    }).catch(error => {
      if (active) setState({ key, data: null, loading: false, error: error.message })
    })
    return () => { active = false }
  }, [id, key, attempt])
  return {
    ...(state.key === key ? state : { data: null, loading: true, error: '' }),
    retry: () => {
      setState({ key, data: null, loading: true, error: '' })
      setAttempt(value => value + 1)
    },
  }
}
