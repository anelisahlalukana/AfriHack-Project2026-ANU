import { http } from './http'

// Client compliance: { clientId, name, status, consent, pep, terrorismFinancing, documents, actions }.
// Adviser compliance retains its existing fields and adds cpd: { start, end, hours, requiredHours, remainingHours, status, records }.
export async function getComplianceSummary() {
  const { data } = await http.get('/api/compliance/summary')
  return data
}
export async function getComplianceAudit(clientId, limit = 50) {
  const path = clientId ? `/api/clients/${clientId}/compliance/audit` : '/api/compliance/audit'
  const { data } = await http.get(path, { params: { limit } })
  return data.entries
}
export async function getClientCompliance(clientId) {
  const { data } = await http.get(`/api/clients/${clientId}/compliance`)
  return data.compliance
}
export async function runClientScreening(clientId, screeningType) {
  const { data } = await http.post(`/api/clients/${clientId}/compliance/screenings`, { screeningType })
  return data
}
export async function getAdviserCompliance(adviserId) {
  const { data } = await http.get(`/api/advisers/${adviserId}/compliance`)
  return data.compliance
}
export async function updateAdviserCompliance(adviserId, updates) {
  const { data } = await http.patch(`/api/advisers/${adviserId}/compliance`, updates)
  return data.compliance
}
export async function addCpdRecord(adviserId, activity) {
  const { data } = await http.post(`/api/advisers/${adviserId}/compliance/cpd`, activity)
  return data
}
