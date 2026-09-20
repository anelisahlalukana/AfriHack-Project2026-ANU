import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attentionRows, hasAttention, riskRows, total } from '../src/lib/dashboardCharts.js'

const payload = (over = {}) => ({
  work: { open: 9, waitingOnUs: 4, waitingOnClients: 3, overdue: 2 },
  documents: { awaitingSignature: 5, oldestWaitingDays: 12, consentsExpired: 1, consentsExpiringSoon: 2, consentWarningDays: 30 },
  onboarding: { stalled: 3, stalledAfterDays: 14 },
  reminders: { overdue: 6, dueSoon: 4, dueSoonDays: 7 },
  clients: { noFinancialAnalysis: 7 },
  ...over,
})
const byKey = (rows, key) => rows.find(row => row.key === key)

test('attention rows carry the count, the page to open and the detail line', () => {
  const rows = attentionRows(payload())
  assert.deepEqual(rows.map(row => [row.key, row.value]), [
    ['waiting_on_us', 4], ['documents', 5], ['onboarding', 3], ['consents', 3], ['reminders', 6], ['analysis', 7],
  ])
  assert.equal(byKey(rows, 'onboarding').to, '/clients?status=onboarding')
  assert.equal(byKey(rows, 'waiting_on_us').detail, '2 overdue (48h+)')
  assert.equal(byKey(rows, 'documents').detail, 'Longest wait: 12 days')
  assert.equal(byKey(rows, 'consents').detail, '1 expired · 2 expiring within 30 days')
  assert.equal(byKey(rows, 'reminders').detail, '4 due in the next 7 days')
})

test('only overdue, stalled, expired and late items are urgent', () => {
  const urgent = rows => rows.filter(row => row.urgent).map(row => row.key)
  assert.deepEqual(urgent(attentionRows(payload())), ['waiting_on_us', 'onboarding', 'consents', 'reminders'])

  const calm = payload({
    work: { open: 2, waitingOnUs: 1, waitingOnClients: 1, overdue: 0 },
    documents: { awaitingSignature: 0, oldestWaitingDays: 0, consentsExpired: 0, consentsExpiringSoon: 2, consentWarningDays: 30 },
    onboarding: { stalled: 0, stalledAfterDays: 14 },
    reminders: { overdue: 0, dueSoon: 1, dueSoonDays: 7 },
  })
  assert.deepEqual(urgent(attentionRows(calm)), [])
  assert.equal(byKey(attentionRows(calm), 'waiting_on_us').detail, 'Nothing overdue')
  assert.equal(byKey(attentionRows(calm), 'documents').detail, 'Nothing waiting on clients')
})

test('a consent that is only expiring soon is counted but not urgent', () => {
  const row = byKey(attentionRows(payload({ documents: { awaitingSignature: 0, oldestWaitingDays: 0, consentsExpired: 0, consentsExpiringSoon: 4, consentWarningDays: 30 } })), 'consents')
  assert.equal(row.value, 4)
  assert.equal(row.urgent, false)
})

test('hasAttention is false only when every queue is empty', () => {
  const empty = payload({
    work: { open: 0, waitingOnUs: 0, waitingOnClients: 0, overdue: 0 },
    documents: { awaitingSignature: 0, oldestWaitingDays: 0, consentsExpired: 0, consentsExpiringSoon: 0, consentWarningDays: 30 },
    onboarding: { stalled: 0, stalledAfterDays: 14 },
    reminders: { overdue: 0, dueSoon: 0, dueSoonDays: 7 },
    clients: { noFinancialAnalysis: 0 },
  })
  assert.equal(hasAttention(attentionRows(empty)), false)
  assert.equal(hasAttention(attentionRows(payload())), true)
})

test('risk rows run cautious to bold, then not assessed, and link to the filtered client list', () => {
  const rows = riskRows({ conservative: 4, growth: 2, aggressive: 1, not_assessed: 5 })
  assert.deepEqual(rows.map(row => [row.label, row.value]), [
    ['Conservative', 4], ['Moderate', 0], ['Balanced', 0], ['Growth', 2], ['Aggressive', 1], ['Not assessed', 5],
  ])
  assert.equal(byKey(rows, 'growth').to, '/clients?risk=growth')
  assert.equal(byKey(rows, 'not_assessed').to, '/clients?risk=none')
  assert.equal(total(rows), 12)
})

test('a risk category outside the known list still shows, without a link', () => {
  const rows = riskRows({ moderate: 2, high_net_worth: 3, not_assessed: 1 })
  const extra = byKey(rows, 'high_net_worth')
  assert.equal(extra.label, 'High net worth')
  assert.equal(extra.value, 3)
  assert.equal(extra.to, null)
  assert.equal(rows.at(-1).key, 'not_assessed')
})

test('risk rows cope with no data at all', () => {
  const rows = riskRows(undefined)
  assert.equal(rows.length, 6)
  assert.equal(total(rows), 0)
})
