import { http } from './http'

// One endpoint for every role. The server scopes the rows from the signed-in
// session, so nothing here says who is asking.
//
// Returns { entries, page, pageSize, total, pageCount, truncated, scope }.
export async function getAuditLog(query = {}) {
  const { data } = await http.get('/api/audit-log', { params: clean(query) })
  return data
}

// Every matching row rather than the current page, for a download. `truncated` in
// the response says whether the server hit its export cap.
export async function getAuditLogForExport(query = {}) {
  const { data } = await http.get('/api/audit-log', { params: { ...clean(query), all: '1' } })
  return data
}

// The distinct sources, categories and actor types this caller can actually see.
export async function getAuditFacets() {
  const { data } = await http.get('/api/audit-log/facets')
  return data
}

// The API rejects unknown and empty filters, so send only what is set.
function clean(query) {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== '' && value != null))
}
