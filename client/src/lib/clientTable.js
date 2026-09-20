import { money, totals } from './financials.js'
import { paginate, sortRows } from './tableUtils.js'

// Re-exported so existing callers keep importing paging from here.
export { paginate }

// Pure logic for the advisor's Clients table: which columns exist, and how rows are
// filtered, sorted and paged. No React in here so it can be tested on its own.

export const fullName = client => [client.first_name, client.second_name, client.surname].filter(Boolean).join(' ')

const text = (key, label) => ({ key, label, type: 'text', get: client => client[key] || null })

// `type` decides how a column sorts: text (case-insensitive), number, or date.
export const COLUMNS = [
  { key: 'name', label: 'Name', type: 'text', locked: true, get: fullName },
  text('id_number', 'ID number'),
  text('contact_email', 'Email'),
  text('contact_mobile', 'Mobile'),
  text('status', 'Status'),
  text('risk_profile_category', 'Risk profile'),
  text('occupation', 'Occupation'),
  text('employer_name', 'Employer'),
  { key: 'annual_income', label: 'Annual income', type: 'number', get: client => (client.annual_income == null ? null : Number(client.annual_income)) },
  text('nationality', 'Nationality'),
  { key: 'date_of_birth', label: 'Date of birth', type: 'date', get: client => client.date_of_birth || null },
  { key: 'net_worth', label: 'Net worth', type: 'number', get: client => totals(client.client_financial_items).netWorth },
  { key: 'goals', label: 'Goals', type: 'number', get: client => (client.client_goals || []).length },
  { key: 'created_at', label: 'Added', type: 'date', get: client => client.created_at || null },
]

export const DEFAULT_VISIBLE = ['name', 'id_number', 'contact_email', 'contact_mobile', 'status', 'net_worth', 'created_at']
export const STATUSES = ['onboarding', 'active', 'inactive']
export const RISK_CATEGORIES = ['conservative', 'moderate', 'balanced', 'growth', 'aggressive']
export const PAGE_SIZES = [10, 25, 50]
// Filter value for clients who haven't had a risk profile recorded.
export const NOT_ASSESSED = 'none'

export const columnByKey = key => COLUMNS.find(column => column.key === key)

// The text shown in a cell (the table adds links and badges on top of this).
export function displayValue(column, client) {
  const value = column.get(client)
  if (value === null || value === undefined || value === '') return '—'
  if (column.key === 'net_worth' || column.key === 'annual_income') return money(value)
  if (column.type === 'date') {
    // Dates with no time part are shown as written, so a birthday never shifts a day with the timezone.
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date(value).toLocaleDateString()
  }
  if (column.key === 'risk_profile_category' || column.key === 'status') return String(value).replaceAll('_', ' ')
  return String(value)
}

export function filterClients(clients, { query = '', status = '', risk = '' } = {}) {
  const needle = query.trim().toLowerCase()
  const digits = needle.replace(/\D/g, '')

  return clients.filter(client => {
    if (status && client.status !== status) return false
    if (risk === NOT_ASSESSED ? client.risk_profile_category : risk && client.risk_profile_category !== risk) return false
    if (!needle) return true

    const haystack = [fullName(client), client.id_number, client.contact_email, client.contact_mobile].filter(Boolean).join(' ').toLowerCase()
    if (haystack.includes(needle)) return true
    // Phone numbers are stored however they were typed ("082 123 4567"), so also match on digits alone.
    return digits.length >= 3 && String(client.contact_mobile || '').replace(/\D/g, '').includes(digits)
  })
}

// Empty values always sort last, whichever direction is chosen. Ties fall back to name so the order is stable.
export function sortClients(clients, key, direction = 'asc') {
  const column = columnByKey(key) || columnByKey('name')
  return sortRows(clients, column, direction, (left, right) =>
    fullName(left).localeCompare(fullName(right), undefined, { sensitivity: 'base' }))
}
