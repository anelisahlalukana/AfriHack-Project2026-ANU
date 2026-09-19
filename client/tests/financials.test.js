import { test } from 'node:test'
import assert from 'node:assert/strict'
import { totals, goalProgress } from '../src/lib/financials.js'

test('net worth uses balances, excluding recurring income and expenses', () => {
  assert.deepEqual(totals([
    { category: 'asset', amount: '100000.50' },
    { category: 'asset', amount: '2000' },
    { category: 'liability', amount: '25000.25' },
    { category: 'income', amount: 500000 },
    { category: 'expense', amount: 30000 },
  ]), { assets: 102000.5, liabilities: 25000.25, netWorth: 77000.25 })
})
test('empty portfolios are zero and negative net worth is preserved', () => {
  assert.deepEqual(totals(), { assets: 0, liabilities: 0, netWorth: 0 })
  assert.equal(totals([{ category: 'liability', amount: 50 }]).netWorth, -50)
})
test('goal progress uses saved monetary amount and handles empty or exceeded targets', () => {
  assert.equal(goalProgress({ current_progress: '2500', target_amount: '10000' }), 25)
  assert.equal(goalProgress({ current_progress: 120, target_amount: 100 }), 100)
  assert.equal(goalProgress({ current_progress: -5, target_amount: 100 }), 0)
  assert.equal(goalProgress({ current_progress: 10, target_amount: 0 }), 0)
  assert.equal(goalProgress({}), 0)
})
