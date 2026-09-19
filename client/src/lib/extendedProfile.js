import { profileSections } from '../constants/profileSections.js'
export const getValue = (object, path) => path.split('.').reduce((value, key) => value?.[key], object)
export function setValue(object, path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  const parent = keys.reduce((result, key) => (result[key] ??= {}), object)
  parent[last] = value
}
export function profileDefaults(client) {
  const result = {}
  for (const section of profileSections) for (const field of section.fields) {
    setValue(result, field.path, (field.column ? client[field.column] : getValue(client.extended_profile, field.path)) ?? '')
  }
  result.dependantsBeneficiaries = (client.client_dependants || []).map(row => ({ ...row }))
  result.planningGoals = Object.fromEntries(['immediate', 'longTerm'].map(key => [key, (client.extended_profile?.goals?.[key] || []).map(text => ({ text }))]))
  return result
}
export function profilePayload(values) {
  const columns = {}, extra = {}
  for (const section of profileSections) for (const field of section.fields) {
    const raw = getValue(values, field.path)
    const value = raw == null || String(raw).trim() === '' ? null : String(raw).trim()
    if (field.column) columns[field.column] = value
    else setValue(extra, field.path, value)
  }
  for (const who of ['personal', 'spouseOrParent']) {
    const allocation = getValue(values, `${who}.workAllocation`) || {}
    if (Object.values(allocation).reduce((sum, value) => sum + Number(value || 0), 0) > 100) throw new Error('Time spent on work activities cannot exceed 100%.')
  }
  const dependants = values.dependantsBeneficiaries || []
  if (dependants.reduce((sum, row) => sum + Math.round(Number(row.beneficiary_percentage || 0) * 100), 0) > 10000) throw new Error('Beneficiary allocations cannot exceed 100%.')
  extra.goals = Object.fromEntries(['immediate', 'longTerm'].map(key => [key, (values.planningGoals?.[key] || []).map(row => row.text.trim()).filter(Boolean)]))
  return { columns, extra, dependants: dependants.map(row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key, value === '' ? null : value]))) }
}

export function validateProfileField(value, field) {
  const text = String(value ?? '').trim()
  if (!text) return field.required ? `${field.label} is required.` : true
  if (text.length > 2000) return `${field.label} must be 2,000 characters or fewer.`
  if (field.options && !field.options.some(option => option.value === text)) return 'Choose a valid relationship.'
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return 'Enter a valid email address, e.g. name@example.com.'
  if (field.type === 'tel' && (!/^[+()\d\s.-]+$/.test(text) || text.replace(/\D/g, '').length < 7 || text.replace(/\D/g, '').length > 15)) return 'Enter a phone number with 7–15 digits, including the country code if needed.'
  if (field.type === 'number') {
    if (!Number.isFinite(Number(text)) || Number(text) < 0) return `${field.label} must be a number of zero or more.`
    if ((field.path.includes('workAllocation') || field.path.endsWith('beneficiary_percentage')) && Number(text) > 100) return 'Enter a percentage between 0 and 100.'
  }
  if (field.type === 'date') {
    const date = new Date(`${text}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) return 'Enter a valid date.'
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' })
    if (text > today) return `${field.label} cannot be in the future.`
  }
  return true
}
