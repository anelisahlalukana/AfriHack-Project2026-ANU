import test from 'node:test'
import assert from 'node:assert/strict'
import { complianceBadge, complianceLabel, complianceDate, cpdPercent, filterCompliance, southAfricaToday } from '../src/lib/complianceStatus.js'
test('compliance labels and unknown states do not silently show green', () => {
  assert.equal(complianceLabel('not_screened'), 'Not screened')
  assert.equal(complianceBadge('clear'), 'badge status-signed')
  assert.equal(complianceBadge('attention'), 'badge status-sent')
  assert.equal(complianceBadge('unrecognized'), 'badge status-flagged')
})
test('CPD percentage clamps underflow and overflow, rejects invalid targets', () => {
  assert.equal(cpdPercent(9, 18), 50)
  assert.equal(cpdPercent(20, 18), 100)
  assert.equal(cpdPercent(-1, 18), 0)
  assert.equal(cpdPercent(1, 0), 0)
  assert.equal(cpdPercent(NaN, 18), 0)
})
test('date formatting uses South African dates and handles missing values', () => {
  assert.equal(southAfricaToday('2026-05-31T22:00:00Z'), '2026-06-01')
  assert.match(complianceDate('2026-05-31T22:00:00Z'), /01 Jun 2026/)
  assert.equal(complianceDate(null), '—')
  assert.equal(complianceDate('bad'), '—')
})
test('search and status filters combine without mutating records', () => {
  const clients = [{ name: 'Thandi Dube', status: 'attention' }, { name: 'Alex Dube', status: 'compliant' }]
  assert.deepEqual(filterCompliance(clients, ' DUBE ', 'attention'), [clients[0]])
  assert.equal(filterCompliance(clients).length, 2)
  assert.equal(clients.length, 2)
})
