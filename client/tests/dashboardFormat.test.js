import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plural, relativeTime, share } from '../src/lib/dashboardFormat.js'

const NOW = new Date('2026-09-19T10:00:00Z').getTime()
const ago = ms => new Date(NOW - ms).toISOString()

test('relativeTime reads naturally from seconds to days', () => {
  assert.equal(relativeTime(ago(20 * 1000), NOW), 'just now')
  assert.equal(relativeTime(ago(5 * 60000), NOW), '5 min ago')
  assert.equal(relativeTime(ago(3 * 3600000), NOW), '3 h ago')
  assert.equal(relativeTime(ago(2 * 86400000), NOW), '2 d ago')
})

test('relativeTime never goes negative for a slightly future timestamp', () => {
  assert.equal(relativeTime(ago(-60000), NOW), 'just now')
})

test('plural', () => {
  assert.equal(plural(1, 'client'), '1 client')
  assert.equal(plural(3, 'client'), '3 clients')
})

test('share stays within 0-100', () => {
  assert.equal(share(1, 4), 25)
  assert.equal(share(5, 4), 100)
  assert.equal(share(1, 0), 0)
})
