import { useEffect, useState } from 'react'
import { getCatalog, getMe, getTask, listTasks } from '../api/tasks'
import { errorMessage } from '../lib/taskFormat'

// Shared loader: keeps the last result per key, supports retry and local replacement
// (so a mutation's response can update the screen without refetching).
function useLoaded(key, load) {
  const [state, setState] = useState({ key: null, data: null, error: '' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (key === null) return undefined
    let active = true
    load().then(data => {
      if (active) setState({ key, data, error: '' })
    }).catch(error => {
      if (active) setState({ key, data: null, error: errorMessage(error) })
    })
    return () => { active = false }
    // `load` is rebuilt every render; `key` fully describes what it fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  const current = state.key === key
  return {
    data: current ? state.data : null,
    error: current ? state.error : '',
    loading: key !== null && !current,
    retry: () => setAttempt(value => value + 1),
    replace: data => setState({ key, data, error: '' }),
  }
}

export function useTask(taskId) {
  return useLoaded(taskId || null, () => getTask(taskId))
}

export function useTaskList(params) {
  const key = JSON.stringify(params || {})
  return useLoaded(key, () => listTasks(JSON.parse(key)))
}

export function useCatalog() {
  return useLoaded('catalog', getCatalog)
}

// Pass enabled = false to skip the request (e.g. for staff, who don't use the client portal).
export function useMe(enabled = true) {
  return useLoaded(enabled ? 'me' : null, getMe)
}
