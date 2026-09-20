import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLIENT_COLUMNS, CLIENT_DEFAULT_VISIBLE, CPD_COLUMNS, CPD_DEFAULT_VISIBLE,
  clientColumnByKey, clientDisplayValue, cpdColumnByKey, cpdDisplayValue, cpdRows, cpdTotals,
  filterClientCompliance, filterCpd, inCycle, paginate, sortClientCompliance, sortCpd,
} from '../src/lib/complianceTables.js'
import { sortRows } from '../src/lib/tableUtils.js'

const client = (name, status, extra = {}) => ({
  clientId: name.toLowerCase(),
  name,
  status,
  consent: { state: 'valid', expiresAt: '2027-01-01T00:00:00Z' },
  pep: { status: 'clear' },
  terrorismFinancing: { status: 'clear' },
  documents: { signed: 5, total: 5 },
  ...extra,
})

const clients = [
  client('Thandi Mokoena', 'compliant'),
  client('Liam Carter', 'action_required', { documents: { signed: 2, total: 5 }, pep: { status: 'flagged' } }),
  client('Sophia Bennett', 'attention', { documents: { signed: 4, total: 5 }, consent: { state: 'expiring', expiresAt: '2026-10-01T00:00:00Z' } }),
]

const cycle = { start: '2026-01-01', end: '2026-12-31' }
const records = [
  { id: 'a', activity: 'FAIS ethics webinar', hours: 3, completedOn: '2026-08-14' },
  { id: 'b', activity: 'Product update: LISP', hours: 2.5, completedOn: '2026-07-02' },
  { id: 'c', activity: 'Regulatory exam prep', hours: 6, completedOn: '2025-11-20' },
]

test('every default column exists in its table', () => {
  for (const [defaults, columns] of [[CLIENT_DEFAULT_VISIBLE, CLIENT_COLUMNS], [CPD_DEFAULT_VISIBLE, CPD_COLUMNS]]) {
    for (const key of defaults) {
      assert.ok(columns.some(column => column.key === key), `unknown default column ${key}`)
    }
  }
  // Each table keeps one column that cannot be switched off, so a row is never blank.
  assert.equal(CLIENT_COLUMNS.filter(column => column.locked).length, 1)
  assert.equal(CPD_COLUMNS.filter(column => column.locked).length, 1)
})

test('client search matches on name and the status filter narrows further', () => {
  assert.deepEqual(filterClientCompliance(clients, { query: 'carter' }).map(row => row.name), ['Liam Carter'])
  assert.deepEqual(filterClientCompliance(clients, { status: 'attention' }).map(row => row.name), ['Sophia Bennett'])
  // Both together must intersect, not union.
  assert.equal(filterClientCompliance(clients, { query: 'carter', status: 'compliant' }).length, 0)
  assert.equal(filterClientCompliance(clients, {}).length, 3)
})

test('the documents column sorts on what is outstanding, not the signed count', () => {
  const column = clientColumnByKey('documents')
  // Liam has 3 outstanding, Sophia 1, Thandi 0.
  assert.deepEqual(sortClientCompliance(clients, 'documents', 'desc').map(row => row.name),
    ['Liam Carter', 'Sophia Bennett', 'Thandi Mokoena'])
  assert.equal(column.get(clients[1]), 3)
  // It still reads as signed/total on screen.
  assert.equal(clientDisplayValue(column, clients[1]), '2/5')
})

test('client sorting falls back to name so the order is stable', () => {
  // Every row has the same consent state, so only the tiebreak can decide.
  const same = [client('Zara Ndlovu', 'compliant'), client('Amara Okafor', 'compliant')]
  assert.deepEqual(sortClientCompliance(same, 'consent', 'asc').map(row => row.name), ['Amara Okafor', 'Zara Ndlovu'])
})

test('an empty cell sorts last in both directions', () => {
  const withoutExpiry = client('No Expiry', 'compliant', { consent: { state: 'not_signed', expiresAt: null } })
  for (const direction of ['asc', 'desc']) {
    const sorted = sortClientCompliance([...clients, withoutExpiry], 'consentExpires', direction)
    assert.equal(sorted.at(-1).name, 'No Expiry', `blank should be last when ${direction}`)
  }
})

test('an activity counts towards the cycle only when it falls inside it', () => {
  assert.equal(inCycle(records[0], cycle), true)
  assert.equal(inCycle(records[2], cycle), false)
  // With no cycle dates nothing can be excluded.
  assert.equal(inCycle(records[2], {}), true)
})

test('the cycle filter uses the same flag the column shows', () => {
  const rows = cpdRows(records, cycle)
  assert.deepEqual(rows.map(row => row.withinCycle), [true, true, false])
  assert.deepEqual(filterCpd(rows, { cycle: 'in' }).map(row => row.id), ['a', 'b'])
  assert.deepEqual(filterCpd(rows, { cycle: 'out' }).map(row => row.id), ['c'])
  assert.equal(filterCpd(rows, {}).length, 3)
  assert.deepEqual(filterCpd(rows, { query: 'lisp' }).map(row => row.id), ['b'])
})

test('CPD sorts numerically on hours, not as text', () => {
  const rows = cpdRows([...records, { id: 'd', activity: 'Long course', hours: 12, completedOn: '2026-03-01' }], cycle)
  assert.deepEqual(sortCpd(rows, 'hours', 'desc').map(row => row.hours), [12, 6, 3, 2.5])
  assert.deepEqual(sortCpd(rows, 'hours', 'asc').map(row => row.hours), [2.5, 3, 6, 12])
})

test('CPD defaults to newest first', () => {
  assert.deepEqual(sortCpd(cpdRows(records, cycle), 'completedOn', 'desc').map(row => row.id), ['a', 'b', 'c'])
})

test('totals describe the filtered view, not the whole cycle', () => {
  const rows = cpdRows(records, cycle)
  assert.deepEqual(cpdTotals(rows), { count: 3, hours: 11.5 })
  assert.deepEqual(cpdTotals(filterCpd(rows, { cycle: 'in' })), { count: 2, hours: 5.5 })
  assert.deepEqual(cpdTotals([]), { count: 0, hours: 0 })
})

test('cpd cells render dates and hours readably', () => {
  const rows = cpdRows(records, cycle)
  assert.equal(cpdDisplayValue(cpdColumnByKey('hours'), rows[0]), '3')
  assert.match(cpdDisplayValue(cpdColumnByKey('completedOn'), rows[0]), /2026/)
  assert.equal(cpdDisplayValue(cpdColumnByKey('completedOn'), { completedOn: null }), '—')
})

test('paging clamps a stale page rather than showing an empty table', () => {
  const view = paginate(clients, 9, 10)
  assert.equal(view.page, 1)
  assert.equal(view.items.length, 3)
  assert.deepEqual([view.start, view.end, view.pageCount], [1, 3, 1])
  const empty = paginate([], 1, 10)
  assert.deepEqual([empty.start, empty.end, empty.total], [0, 0, 0])
})

test('the shared sorter puts blanks last whichever way it is pointed', () => {
  const column = { type: 'number', get: row => row.value }
  const rows = [{ value: 2 }, { value: null }, { value: 1 }]
  assert.deepEqual(sortRows(rows, column, 'asc').map(row => row.value), [1, 2, null])
  assert.deepEqual(sortRows(rows, column, 'desc').map(row => row.value), [2, 1, null])
})
