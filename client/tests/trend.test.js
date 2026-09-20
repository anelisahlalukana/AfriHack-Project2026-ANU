import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasTrend, mergeTrend, monthLabel, monthName, monthRanges, niceTicks } from '../src/lib/trend.js'

test('the ranges are whole completed months, with an equal stretch straight before', () => {
  assert.deepEqual(monthRanges(6, new Date(2026, 8, 20)), {
    current: { from: '2026-03-01', to: '2026-08-31' },
    previous: { from: '2025-09-01', to: '2026-02-28' },
  })
})

test('the ranges cross a year boundary', () => {
  assert.deepEqual(monthRanges(12, new Date(2026, 0, 5)), {
    current: { from: '2025-01-01', to: '2025-12-31' },
    previous: { from: '2024-01-01', to: '2024-12-31' },
  })
  assert.deepEqual(monthRanges(6, new Date(2026, 1, 1)).current, { from: '2025-08-01', to: '2026-01-31' })
})

test('the last day of February follows leap years', () => {
  assert.equal(monthRanges(1, new Date(2028, 2, 10)).current.to, '2028-02-29')
  assert.equal(monthRanges(1, new Date(2027, 2, 10)).current.to, '2027-02-28')
})

test('a period is one row per month with every task type added together', () => {
  const now = { series: [{ key: 's0' }, { key: 's1' }, { key: 'other' }], rows: [{ label: '2026-07', s0: 2, s1: 1, other: 1 }, { label: '2026-08', s0: 5, s1: 0, other: 0 }] }
  const before = { series: [{ key: 's0' }], rows: [{ label: '2026-01', s0: 3 }, { label: '2026-02', s0: 4 }] }
  assert.deepEqual(mergeTrend(now, before), [
    { label: '2026-07', value: 4, previous: 3 },
    { label: '2026-08', value: 5, previous: 4 },
  ])
})

test('a shorter previous period leaves the dashed line without a point rather than a zero', () => {
  const now = { series: [{ key: 's0' }], rows: [{ label: 'a', s0: 1 }, { label: 'b', s0: 2 }, { label: 'c', s0: 3 }] }
  const before = { series: [{ key: 's0' }], rows: [{ label: 'x', s0: 9 }] }
  assert.deepEqual(mergeTrend(now, before).map(row => row.previous), [9, undefined, undefined])
})

test('a report with no series or no rows still merges', () => {
  assert.deepEqual(mergeTrend({ series: [], rows: [{ label: '2026-07' }] }, { series: [], rows: [] }), [{ label: '2026-07', value: 0, previous: undefined }])
  assert.deepEqual(mergeTrend(undefined, undefined), [])
})

test('hasTrend is false only when both lines are flat at zero', () => {
  assert.equal(hasTrend([{ label: 'a', value: 0, previous: 0 }, { label: 'b', value: 0 }]), false)
  assert.equal(hasTrend([{ label: 'a', value: 0, previous: 2 }]), true)
  assert.equal(hasTrend([{ label: 'a', value: 1 }]), true)
  assert.equal(hasTrend([]), false)
})

test('axis labels are short months, with the year on the first month and each January', () => {
  assert.equal(monthLabel('2026-03', 0), 'Mar ’26')
  assert.equal(monthLabel('2026-04', 1), 'Apr')
  assert.equal(monthLabel('2027-01', 5), 'Jan ’27')
})

test('the hover card names the full month', () => {
  assert.equal(monthName('2026-09'), 'September 2026')
})

test('axis ticks are round whole numbers that reach the biggest value', () => {
  assert.deepEqual(niceTicks(36), [0, 10, 20, 30, 40])
  assert.deepEqual(niceTicks(49), [0, 20, 40, 60])
  assert.deepEqual(niceTicks(7), [0, 2, 4, 6, 8])
  assert.deepEqual(niceTicks(120), [0, 50, 100, 150])
})

test('axis ticks stay whole numbers for tiny or empty data', () => {
  assert.deepEqual(niceTicks(0), [0, 1])
  assert.deepEqual(niceTicks(1), [0, 1])
  assert.deepEqual(niceTicks(3), [0, 1, 2, 3])
  assert.deepEqual(niceTicks(undefined), [0, 1])
  assert.ok(niceTicks(9).every(Number.isInteger))
})
