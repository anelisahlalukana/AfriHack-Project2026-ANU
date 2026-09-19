import test from 'node:test'
import assert from 'node:assert/strict'
import { statusLabel, waitingLabel, progressText, formRows, providersFor, errorMessage, todayInputValue, fileSize, dynamicDefaults, compactForm } from '../src/lib/taskFormat.js'

test('status and waiting labels depend on who is looking', () => {
  assert.equal(statusLabel('awaiting_client'), 'Needs you')
  assert.equal(statusLabel('awaiting_client', 'staff'), 'Waiting on client')
  assert.equal(waitingLabel('provider', 'Santam'), 'Waiting on Santam')
  assert.equal(waitingLabel('us', null, 'client'), 'With your adviser')
  assert.equal(waitingLabel(null), '')
})

test('progress reads like the style reference', () => {
  assert.equal(progressText({ step: 6, total: 10 }), 'Step 6 of 10')
  assert.equal(progressText({ step: 0, total: 4 }), 'Not started · 4 steps')
  assert.equal(progressText({ declined: true }), 'Declined')
})

test('form rows follow config order and format values', () => {
  const fields = [
    { key: 'police_notified', label: 'Police notified', type: 'boolean' },
    { key: 'amount_claimed', label: 'Amount claimed (ZAR)', type: 'number' },
    { key: 'skipped', label: 'Skipped', type: 'text' },
    { key: 'items', label: 'Items', type: 'financial_items' },
  ]
  const rows = formRows(fields, { police_notified: false, amount_claimed: 1500, items: [{ item_type: 'Car', category: 'asset', amount: 100 }] })
  assert.deepEqual(rows.map(r => r.label), ['Police notified', 'Amount claimed (ZAR)', 'Items'])
  assert.equal(rows[0].value, 'No')
  assert.match(rows[1].value, /R\s?1\s?500/)
  assert.match(rows[2].value, /^Car \(asset\)/)
})

test('providers are filtered by product line', () => {
  const providers = [{ name: 'Santam', product_lines: ['motor'] }, { name: 'Sanlam', product_lines: ['life'] }]
  assert.deepEqual(providersFor(providers, 'motor').map(p => p.name), ['Santam'])
  assert.equal(providersFor(providers, null).length, 2)
})

test('helpers: API errors, dates, file sizes', () => {
  assert.equal(errorMessage({}), 'Something went wrong. Please try again.')
  assert.equal(errorMessage(new Error('Network Error')), 'Network Error')
  assert.match(todayInputValue(new Date('2026-09-19T10:00:00')), /^2026-09-19$/)
  assert.equal(fileSize(2048), '2 KB')
  assert.equal(fileSize(3 * 1024 * 1024), '3.0 MB')
})

test('form defaults and blank answers', () => {
  const fields = [{ key: 'a', type: 'text' }, { key: 'b', type: 'boolean' }, { key: 'items', type: 'financial_items' }]
  assert.deepEqual(dynamicDefaults(fields, { a: 'saved' }), { a: 'saved', b: false, items: [{ category: 'asset', item_type: '', amount: '' }] })
  assert.deepEqual(compactForm({ a: '', b: false, c: 'x', d: null }), { b: false, c: 'x' })
})

test('waiting labels for the provider portal', () => {
  assert.equal(waitingLabel('provider', 'Old Mutual', 'provider'), 'Waiting on you')
  assert.equal(waitingLabel('us', 'Old Mutual', 'provider'), 'With Royal Square')
  assert.equal(waitingLabel('client', 'Old Mutual', 'provider'), 'Waiting on the client')
  assert.equal(waitingLabel(null, 'Old Mutual', 'provider'), '')
})
