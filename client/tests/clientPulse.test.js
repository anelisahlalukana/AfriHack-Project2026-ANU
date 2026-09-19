import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankingNote, riskBadge, signalDate, signalDetails } from '../src/lib/clientPulse.js'
import { money } from '../src/lib/financials.js'

test('risk badges: high is red, medium is amber, anything else reads as not at risk', () => {
  assert.deepEqual(riskBadge('high'), { label: 'High', phrase: 'High risk', className: 'badge status-flagged' })
  assert.deepEqual(riskBadge('medium'), { label: 'Medium', phrase: 'Medium risk', className: 'badge status-sent' })
  assert.equal(riskBadge('low').label, 'Not at risk')
  assert.equal(riskBadge('low').phrase, 'Not at risk')
  assert.equal(riskBadge(undefined).label, 'Not at risk')
})

test('dates: a plain date never slips a day, a timestamp is formatted, blank stays blank', () => {
  assert.equal(signalDate('2026-09-01'), '1 Sep 2026')
  assert.match(signalDate('2026-09-19T10:00:00.000Z'), /19 Sep/)
  assert.equal(signalDate(null), '')
  assert.equal(signalDate(''), '')
})

test('the ranking note appears only when the list is cut off', () => {
  assert.equal(rankingNote({ flaggedTotal: 12, clients: new Array(5) }), 'Showing the 5 highest-risk of 12 clients that need attention.')
  assert.equal(rankingNote({ flaggedTotal: 5, clients: new Array(5) }), '')
  assert.equal(rankingNote({ flaggedTotal: 0, clients: [] }), '')
})

test('document and task signals show the data behind them', () => {
  assert.deepEqual(signalDetails({ kind: 'document', since: '2026-09-09T10:00:00.000Z' }), ['Sent to the client on 9 Sep 2026'])
  const lines = signalDetails({ kind: 'task', reference: 'RSF-12', title: 'Change of address', typeLabel: 'x', since: '2026-09-10T10:00:00.000Z', waitingOn: 'us' })
  assert.deepEqual(lines, ['RSF-12 · Change of address', 'Last updated 10 Sep 2026 · Waiting on us'])
  assert.deepEqual(signalDetails({ kind: 'task', reference: 'RSF-13', title: null, typeLabel: 'Border letter', since: '2026-09-10T10:00:00.000Z', waitingOn: null }), ['RSF-13 · Border letter', 'Last updated 10 Sep 2026'])
})

test('goal signals show progress, or say when no target is set', () => {
  const goal = { kind: 'goal', currentProgress: 0, targetAmount: 50000, targetDate: '2027-01-01' }
  const [saved, date] = signalDetails(goal)
  assert.equal(saved, `${money(0)} of ${money(50000)} saved`)
  assert.equal(date, 'Target date 1 Jan 2027')
  assert.deepEqual(signalDetails({ ...goal, targetAmount: null, targetDate: null }), ['No target amount set', 'No target date'])
})

test('onboarding signals summarise the paperwork', () => {
  assert.deepEqual(signalDetails({ kind: 'onboarding', signed: 1, awaitingClient: 1, notSent: 3 }), ['1 of 5 documents signed', '1 awaiting the client · 3 not sent'])
  assert.deepEqual(signalDetails({ kind: 'onboarding', signed: 4, awaitingClient: 0, notSent: 1 }), ['4 of 5 documents signed', '1 not sent'])
  assert.deepEqual(signalDetails({ kind: 'onboarding', signed: 5, awaitingClient: 0, notSent: 0 }), ['5 of 5 documents signed'])
})

test('reminder signals list each overdue reminder', () => {
  const lines = signalDetails({ kind: 'reminder', reminders: [
    { title: 'Annual review', triggerDate: '2026-09-16', daysOverdue: 3 },
    { title: 'Valuation', triggerDate: '2026-09-18', daysOverdue: 1 },
  ] })
  assert.deepEqual(lines, ['Annual review · due 16 Sep 2026 · 3 days overdue', 'Valuation · due 18 Sep 2026 · 1 day overdue'])
})

test('an unknown signal kind produces no detail lines instead of crashing', () => {
  assert.deepEqual(signalDetails({ kind: 'something-new' }), [])
})
