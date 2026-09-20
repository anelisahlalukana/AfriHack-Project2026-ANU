// Pure logic for the two tables on the compliance page: which columns exist, and how
// rows are filtered, sorted and paged. No React in here so it can be tested on its own.
//
// Tab 1 is one row per client (from /api/compliance/summary).
// Tab 2 is one row per CPD activity the signed-in adviser has recorded.

import { complianceDate, complianceLabel } from './complianceStatus.js'
import { paginate, sortRows } from './tableUtils.js'

export { paginate }

export const PAGE_SIZES = [10, 25, 50]

// ---------------------------------------------------------------------------
// Tab 1: client compliance
// ---------------------------------------------------------------------------

const status = (key, label, get) => ({ key, label, type: 'text', kind: 'status', get })

export const CLIENT_COLUMNS = [
  { key: 'name', label: 'Client', type: 'text', locked: true, get: row => row.name },
  status('status', 'Status', row => row.status),
  status('consent', 'Consent', row => row.consent.state),
  { key: 'consentExpires', label: 'Consent expires', type: 'date', get: row => row.consent.expiresAt || null },
  status('pep', 'PEP', row => row.pep.status),
  status('terrorismFinancing', 'Terrorism financing', row => row.terrorismFinancing.status),
  // Sorts on how many are still outstanding, so the clients needing work come first.
  { key: 'documents', label: 'Documents', type: 'number', get: row => row.documents.total - row.documents.signed },
]

export const CLIENT_DEFAULT_VISIBLE = ['name', 'status', 'consent', 'pep', 'terrorismFinancing', 'documents']
export const CLIENT_STATUSES = ['action_required', 'attention', 'compliant']

export function clientColumnByKey(key) {
  return CLIENT_COLUMNS.find(column => column.key === key)
}

// The text shown in a cell. The table renders status columns as badges on top of this.
export function clientDisplayValue(column, row) {
  if (column.key === 'documents') return `${row.documents.signed}/${row.documents.total}`
  const value = column.get(row)
  if (value === null || value === undefined || value === '') return '—'
  if (column.type === 'date') return complianceDate(value)
  if (column.kind === 'status') return complianceLabel(value)
  return String(value)
}

export function filterClientCompliance(rows, { query = '', status: statusFilter = '' } = {}) {
  const needle = query.trim().toLowerCase()
  return rows.filter(row => {
    if (statusFilter && row.status !== statusFilter) return false
    return !needle || row.name.toLowerCase().includes(needle)
  })
}

export function sortClientCompliance(rows, key, direction = 'asc') {
  const column = clientColumnByKey(key) || clientColumnByKey('name')
  return sortRows(rows, column, direction, (left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
}

// ---------------------------------------------------------------------------
// Tab 2: CPD activities
// ---------------------------------------------------------------------------

// An activity counts towards the current cycle only if it was completed inside it.
export function inCycle(record, cycle) {
  if (!cycle?.start || !cycle?.end) return true
  return record.completedOn >= cycle.start && record.completedOn <= cycle.end
}

export const CPD_COLUMNS = [
  { key: 'activity', label: 'Activity', type: 'text', locked: true, get: row => row.activity },
  { key: 'hours', label: 'Hours', type: 'number', get: row => Number(row.hours) },
  { key: 'completedOn', label: 'Completed on', type: 'date', get: row => row.completedOn || null },
  { key: 'cycle', label: 'Cycle', type: 'text', kind: 'status', get: row => (row.withinCycle ? 'In cycle' : 'Outside cycle') },
]

export const CPD_DEFAULT_VISIBLE = ['activity', 'hours', 'completedOn', 'cycle']
export const CPD_CYCLE_FILTERS = ['in', 'out']

export function cpdColumnByKey(key) {
  return CPD_COLUMNS.find(column => column.key === key)
}

export function cpdDisplayValue(column, row) {
  const value = column.get(row)
  if (value === null || value === undefined || value === '') return '—'
  if (column.type === 'date') return complianceDate(value)
  if (column.key === 'hours') return `${value}`
  return String(value)
}

// Tags each record with whether it falls in the current cycle, so the column, the
// filter and the sort all read the same value.
export function cpdRows(records = [], cycle) {
  return records.map(record => ({ ...record, withinCycle: inCycle(record, cycle) }))
}

export function filterCpd(rows, { query = '', cycle = '' } = {}) {
  const needle = query.trim().toLowerCase()
  return rows.filter(row => {
    if (cycle === 'in' && !row.withinCycle) return false
    if (cycle === 'out' && row.withinCycle) return false
    return !needle || String(row.activity).toLowerCase().includes(needle)
  })
}

export function sortCpd(rows, key, direction = 'desc') {
  const column = cpdColumnByKey(key) || cpdColumnByKey('completedOn')
  return sortRows(rows, column, direction, (left, right) =>
    String(left.activity).localeCompare(String(right.activity), undefined, { sensitivity: 'base' }))
}

// Totals for what is on screen, so a filtered view reports its own hours rather than
// the whole cycle's.
export function cpdTotals(rows) {
  return {
    count: rows.length,
    hours: Math.round(rows.reduce((total, row) => total + (Number(row.hours) || 0), 0) * 100) / 100,
  }
}
