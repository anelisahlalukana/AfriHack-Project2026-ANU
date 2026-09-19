import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
vi.mock('../../src/lib/supabaseClient', () => ({ supabase: { auth: { getSession } } }))

const { http } = await import('../../src/api/http')

// Replaces the network: records what would have been sent and answers with `respond`.
function stubAdapter(respond) {
  const sent = []
  http.defaults.adapter = async config => {
    sent.push(config)
    return respond(config)
  }
  return sent
}
const ok = config => ({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config })
function httpFailure(config, status, data) {
  const error = new Error(`Request failed with status code ${status}`)
  error.isAxiosError = true
  error.config = config
  error.response = { status, data, headers: {}, config }
  return Promise.reject(error)
}

describe('shared API client', () => {
  beforeEach(() => getSession.mockReset())

  it('attaches the current Supabase access token as a Bearer header', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
    const sent = stubAdapter(ok)
    await http.get('/api/tasks')
    expect(sent[0].headers.Authorization).toBe('Bearer tok-123')
  })

  it('sends no Authorization header when signed out', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    const sent = stubAdapter(ok)
    await http.get('/api/health')
    expect(sent[0].headers.Authorization).toBeUndefined()
  })

  it("surfaces the backend's { error } message instead of axios's generic one", async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    stubAdapter(config => httpFailure(config, 400, { error: "Field 'email' is required" }))
    await expect(http.post('/api/clients', {})).rejects.toThrow("Field 'email' is required")
  })

  it('keeps the generic message when the server sent no { error } body', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    stubAdapter(config => httpFailure(config, 502, '<html>Bad gateway</html>'))
    await expect(http.get('/api/tasks')).rejects.toThrow('Request failed with status code 502')
  })

  it('explains an unreachable server in plain words', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    stubAdapter(() => Promise.reject(Object.assign(new Error('Network Error'), { isAxiosError: true })))
    await expect(http.get('/api/tasks')).rejects.toThrow("Couldn't reach the server")
  })
})
