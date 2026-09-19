import { getProviderMe, getProviderTask, listProviderTasks } from '../api/provider'
import { useLoaded } from './useTasks'

export function useProviderMe() {
  return useLoaded('provider-me', getProviderMe)
}

export function useProviderTasks(params) {
  const key = JSON.stringify(params || {})
  return useLoaded(key, () => listProviderTasks(JSON.parse(key)))
}

export function useProviderTask(taskId) {
  return useLoaded(taskId || null, () => getProviderTask(taskId))
}
