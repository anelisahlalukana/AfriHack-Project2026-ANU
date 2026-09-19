import { test } from 'node:test'
import assert from 'node:assert/strict'
import { audienceLabel, recurrenceLabel, todayKey, daysUntil, reminderState, relativeDue, countByView, filterReminders, sortReminders } from '../src/lib/reminderTable.js'

const today = '2026-09-19'
const reminder = (id, title, dueDate, status = 'active', clientId = 'c1') => ({ id, title, dueDate, status, clientId, audience: 'both', repeatMonths: 0 })
const list = [
  reminder('a', 'Insurance valuation', '2026-10-01'),
  reminder('b', 'Driving licence expiry', '2026-09-10'),
  reminder('c', 'Annual review', '2026-09-19'),
  reminder('d', 'Retirement fee', '2026-08-01', 'notified', 'c2'),
  reminder('e', 'Birthday', '2026-09-01', 'completed', 'c2'),
]
const ids = items => items.map(item => item.id).join(',')
const names = { c1: 'Thandi Mokoena', c2: 'Sipho Dlamini' }

test('today is worked out in South African time, not the browser or server zone', () => {
  assert.equal(todayKey(new Date('2026-09-19T22:30:00Z')), '2026-09-20') // 00:30 on the 20th in Johannesburg
  assert.equal(todayKey(new Date('2026-09-19T21:30:00Z')), '2026-09-19')
})

test('days until a date, including month and leap-year boundaries', () => {
  assert.equal(daysUntil('2026-09-19', today), 0)
  assert.equal(daysUntil('2026-09-20', today), 1)
  assert.equal(daysUntil('2026-09-10', today), -9)
  assert.equal(daysUntil('2028-03-01', '2028-02-28'), 2)
})

test('a reminder is overdue, due today, upcoming, sent or completed', () => {
  assert.deepEqual(list.map(item => reminderState(item, today)), ['upcoming', 'overdue', 'today', 'sent', 'completed'])
})

test('relative wording for due dates', () => {
  assert.equal(relativeDue('2026-09-19', today), 'Today')
  assert.equal(relativeDue('2026-09-20', today), 'Tomorrow')
  assert.equal(relativeDue('2026-09-18', today), 'Yesterday')
  assert.equal(relativeDue('2026-10-01', today), 'In 12 days')
  assert.equal(relativeDue('2026-09-10', today), '9 days ago')
})

test('view tabs count only the reminders they contain', () => {
  assert.deepEqual(countByView(list, today), { open: 3, overdue: 1, done: 2, all: 5 })
})

test('filters by view, client and search (title or client name)', () => {
  assert.equal(ids(filterReminders(list, { view: 'open' }, today, id => names[id])), 'a,b,c')
  assert.equal(ids(filterReminders(list, { view: 'overdue' }, today, id => names[id])), 'b')
  assert.equal(ids(filterReminders(list, { view: 'done' }, today, id => names[id])), 'd,e')
  assert.equal(ids(filterReminders(list, { view: 'all', clientId: 'c2' }, today, id => names[id])), 'd,e')
  assert.equal(ids(filterReminders(list, { view: 'all', query: 'sipho' }, today, id => names[id])), 'd,e')
  assert.equal(ids(filterReminders(list, { view: 'all', query: 'LICENCE' }, today, id => names[id])), 'b')
  assert.equal(ids(filterReminders(list, { view: 'all', query: 'nothing matches' }, today, id => names[id])), '')
  assert.equal(ids(filterReminders(list, undefined, today)), 'a,b,c') // defaults to Open
})

test('overdue first, then today, then upcoming, then finished; earliest date first within a group', () => {
  assert.equal(ids(sortReminders(list, today)), 'b,c,a,d,e')
  const copy = [...list]
  sortReminders(list, today)
  assert.deepEqual(list, copy) // the original list is not reordered
})

test('labels for audience and repeat interval', () => {
  assert.equal(audienceLabel('adviser'), 'Advisers')
  assert.equal(audienceLabel('both'), 'Client and advisers')
  assert.equal(recurrenceLabel(0), 'One time')
  assert.equal(recurrenceLabel(1), 'Every 1 month')
  assert.equal(recurrenceLabel(12), 'Every 12 months')
})
