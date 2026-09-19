import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterClients, sortClients, paginate, displayValue, columnByKey, COLUMNS, DEFAULT_VISIBLE, NOT_ASSESSED } from '../src/lib/clientTable.js'

const clients = [
  { id: '1', first_name: 'Zola', second_name: null, surname: 'Dlamini', id_number: '8001015009087', contact_email: 'zola@example.com', contact_mobile: '082 123 4567', status: 'active', risk_profile_category: 'growth', annual_income: '450000', created_at: '2026-03-01T10:00:00Z', client_financial_items: [{ category: 'asset', amount: '100000' }, { category: 'liability', amount: '25000' }], client_goals: [{}, {}] },
  { id: '2', first_name: 'anna', second_name: 'Marie', surname: 'Botha', id_number: '9002025009088', contact_email: 'ANNA@example.com', contact_mobile: null, status: 'onboarding', risk_profile_category: null, annual_income: null, created_at: '2026-01-15T10:00:00Z', client_financial_items: [], client_goals: [] },
  { id: '3', first_name: 'Ben', second_name: null, surname: 'Adams', id_number: null, contact_email: null, contact_mobile: '0715559999', status: 'inactive', risk_profile_category: 'conservative', annual_income: '90000', created_at: '2026-02-10T10:00:00Z', client_financial_items: [{ category: 'asset', amount: '5000' }], client_goals: [{}] },
]
const ids = list => list.map(client => client.id).join(',')

test('name column is locked, and every default column exists', () => {
  assert.equal(columnByKey('name').locked, true)
  for (const key of DEFAULT_VISIBLE) assert.ok(COLUMNS.some(column => column.key === key), key)
})

test('search matches name, ID number, email (any case) and mobile', () => {
  assert.equal(ids(filterClients(clients, { query: 'dlamini' })), '1')
  assert.equal(ids(filterClients(clients, { query: 'marie botha' })), '2')
  assert.equal(ids(filterClients(clients, { query: '9002025' })), '2')
  assert.equal(ids(filterClients(clients, { query: 'anna@EXAMPLE' })), '2')
  assert.equal(ids(filterClients(clients, { query: '  ' })), '1,2,3')
})

test('search finds a mobile number however it was typed', () => {
  assert.equal(ids(filterClients(clients, { query: '0821234567' })), '1')
  assert.equal(ids(filterClients(clients, { query: '082-123' })), '1')
  assert.equal(ids(filterClients(clients, { query: '555 9999' })), '3')
})

test('status and risk filters combine with search; "not assessed" finds clients with no risk profile', () => {
  assert.equal(ids(filterClients(clients, { status: 'active' })), '1')
  assert.equal(ids(filterClients(clients, { risk: 'conservative' })), '3')
  assert.equal(ids(filterClients(clients, { risk: NOT_ASSESSED })), '2')
  assert.equal(ids(filterClients(clients, { status: 'active', risk: 'conservative' })), '')
  assert.equal(ids(filterClients(clients, { status: 'inactive', query: 'ben' })), '3')
})

test('text sorts case-insensitively in both directions', () => {
  // Full names: "anna Marie Botha" (lower-case a), "Ben Adams", "Zola Dlamini".
  assert.equal(ids(sortClients(clients, 'name', 'asc')), '2,3,1')
  assert.equal(ids(sortClients(clients, 'name', 'desc')), '1,3,2')
  assert.equal(ids(sortClients(clients, 'contact_email', 'asc')), '2,1,3') // ANNA@, zola@, then the empty email last
})

test('numbers sort numerically, not as text', () => {
  assert.equal(ids(sortClients(clients, 'annual_income', 'asc')), '3,1,2')
  assert.equal(ids(sortClients(clients, 'annual_income', 'desc')), '1,3,2')
  assert.equal(ids(sortClients(clients, 'net_worth', 'desc')), '1,3,2')
  assert.equal(ids(sortClients(clients, 'goals', 'desc')), '1,3,2')
})

test('dates sort by time, and empty values always come last', () => {
  assert.equal(ids(sortClients(clients, 'created_at', 'asc')), '2,3,1')
  assert.equal(ids(sortClients(clients, 'created_at', 'desc')), '1,3,2')
  assert.equal(ids(sortClients(clients, 'contact_mobile', 'asc')).endsWith('2'), true)
  assert.equal(ids(sortClients(clients, 'contact_mobile', 'desc')).endsWith('2'), true)
  assert.equal(ids(sortClients(clients, 'id_number', 'asc')).endsWith('3'), true)
})

test('sorting does not change the original list and falls back to name for an unknown column', () => {
  const copy = [...clients]
  sortClients(clients, 'net_worth', 'desc')
  assert.deepEqual(clients, copy)
  assert.equal(ids(sortClients(clients, 'nonsense', 'asc')), ids(sortClients(clients, 'name', 'asc')))
})

test('pagination slices, reports the range, and clamps stale page numbers', () => {
  const rows = Array.from({ length: 23 }, (_, index) => ({ id: String(index) }))
  const first = paginate(rows, 1, 10)
  assert.deepEqual([first.items.length, first.page, first.pageCount, first.start, first.end, first.total], [10, 1, 3, 1, 10, 23])
  const last = paginate(rows, 3, 10)
  assert.deepEqual([last.items.length, last.start, last.end], [3, 21, 23])
  assert.equal(paginate(rows, 99, 10).page, 3)
  assert.equal(paginate(rows, 0, 10).page, 1)
  assert.equal(paginate(rows, 'abc', 10).page, 1)
  const empty = paginate([], 5, 10)
  assert.deepEqual([empty.items.length, empty.page, empty.pageCount, empty.start, empty.end], [0, 1, 1, 0, 0])
})

test('cells show a dash for empty values, formatted money, and dates without timezone drift', () => {
  const [zola, anna] = clients
  assert.equal(displayValue(columnByKey('name'), anna), 'anna Marie Botha')
  assert.equal(displayValue(columnByKey('contact_mobile'), anna), '—')
  assert.match(displayValue(columnByKey('net_worth'), zola), /75\s?000/)
  assert.equal(displayValue(columnByKey('annual_income'), anna), '—')
  assert.equal(displayValue(columnByKey('date_of_birth'), { date_of_birth: '1990-01-01' }), '1990-01-01')
  assert.equal(displayValue(columnByKey('risk_profile_category'), { risk_profile_category: 'growth' }), 'growth')
})
