// Pure logic for the audit log table: which columns exist, how each cell is
// formatted for the screen, and how each value is typed for a download. No React
// and no network in here, so it can be tested on its own.
//
// Filtering, sorting and paging happen on the server (an audit log grows without
// bound, so the browser never holds the whole table). This module owns everything
// about presentation: column definitions, labels and export shaping.

export const PAGE_SIZES = [25, 50, 100]

// The three activity sources in public.audit_events.
export const SOURCE_LABELS = {
  compliance: 'Compliance',
  task: 'Claims & requests',
  provider: 'Provider',
}

export const ACTOR_LABELS = {
  staff: 'Royal Square',
  adviser: 'Adviser',
  client: 'Client',
  provider: 'Provider',
  system: 'System',
}

// Turns snake_case and lower case database values into something readable.
export const humanise = value =>
  String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/^./, character => character.toUpperCase())

// South African dates throughout, matching the rest of the compliance screens.
const DATE_TIME = new Intl.DateTimeFormat('en-ZA', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

export function formatTimestamp(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : DATE_TIME.format(date).replace(',', '')
}

// `type` drives both the column alignment and how a downloaded cell is typed:
// 'datetime' becomes a real date cell in Excel, 'text' stays text.
export const COLUMNS = [
  { key: 'occurredAt', label: 'When', type: 'datetime', locked: true, width: 20, get: row => row.occurredAt },
  { key: 'source', label: 'Source', type: 'text', width: 18, get: row => SOURCE_LABELS[row.source] || humanise(row.source) },
  { key: 'category', label: 'Event', type: 'text', width: 24, get: row => humanise(row.category) },
  { key: 'summary', label: 'Detail', type: 'text', width: 56, get: row => row.summary || '' },
  { key: 'result', label: 'Result', type: 'text', width: 16, get: row => humanise(row.result) },
  { key: 'actorName', label: 'Who', type: 'text', width: 24, get: row => row.actorName || '' },
  { key: 'actorType', label: 'Acting as', type: 'text', width: 16, get: row => ACTOR_LABELS[row.actorType] || humanise(row.actorType) },
  { key: 'clientName', label: 'Client', type: 'text', width: 24, get: row => row.clientName || '' },
  { key: 'providerName', label: 'Provider', type: 'text', width: 24, get: row => row.providerName || '' },
  { key: 'taskReference', label: 'Reference', type: 'text', width: 16, get: row => row.taskReference || '' },
]

// What each role sees by default. Providers have no adviser-side context, and an
// admin wants the client and provider columns up front.
export const DEFAULT_VISIBLE = {
  admin: ['occurredAt', 'source', 'category', 'summary', 'actorName', 'clientName', 'providerName'],
  advisor: ['occurredAt', 'source', 'category', 'summary', 'actorName', 'clientName'],
  provider: ['occurredAt', 'category', 'summary', 'result', 'taskReference'],
}

// Columns that would always be blank for a role are hidden from the column menu
// too, so nobody can switch on a column that can never hold anything.
export const AVAILABLE_COLUMNS = {
  admin: COLUMNS.map(column => column.key),
  advisor: COLUMNS.map(column => column.key),
  provider: ['occurredAt', 'source', 'category', 'summary', 'result', 'actorName', 'actorType', 'taskReference'],
}

export const columnByKey = key => COLUMNS.find(column => column.key === key)

export function columnsFor(role, visible) {
  const allowed = AVAILABLE_COLUMNS[role] || AVAILABLE_COLUMNS.advisor
  return COLUMNS.filter(column => allowed.includes(column.key) && visible.includes(column.key))
}

export function defaultVisibleFor(role) {
  return DEFAULT_VISIBLE[role] || DEFAULT_VISIBLE.advisor
}

// The text shown in a cell. Empty values read as an em dash on screen but stay
// genuinely empty in a download, so a spreadsheet filter does not treat "—" as data.
export function displayValue(column, row) {
  const value = column.get(row)
  if (value === null || value === undefined || value === '') return '—'
  if (column.type === 'datetime') return formatTimestamp(value)
  return String(value)
}

// One row shaped for a download: values keep their type so the writer can make a
// date cell a date rather than a string.
export function exportRow(columns, row) {
  return columns.map(column => {
    const value = column.get(row)
    if (value === null || value === undefined || value === '') return { type: column.type, value: null }
    if (column.type === 'datetime') {
      const date = new Date(value)
      return { type: 'datetime', value: Number.isNaN(date.getTime()) ? null : date }
    }
    return { type: 'text', value: String(value) }
  })
}

export function exportTable(columns, rows) {
  return {
    columns: columns.map(column => ({ label: column.label, type: column.type, width: column.width })),
    rows: rows.map(row => exportRow(columns, row)),
  }
}

// A stable, sortable file name: audit-log-2026-09-20-143005.csv
export function exportFileName(extension, now = new Date()) {
  const pad = number => String(number).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `audit-log-${stamp}.${extension}`
}
