import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseUsername } from '../src/lib/loginIdentifier.js'

test('a valid email is accepted as an advisor/admin username, with surrounding spaces trimmed', () => {
  assert.deepEqual(parseUsername(' name@example.com '), { kind: 'email', value: 'name@example.com' })
  assert.deepEqual(parseUsername('first.last+tag@sub.example.co.za'), { kind: 'email', value: 'first.last+tag@sub.example.co.za' })
})

test('anything with an @ must be a well-formed email', () => {
  for (const bad of ['name@', '@example.com', 'name@example', 'na me@example.com', 'a@@b.com']) {
    assert.match(parseUsername(bad).error, /valid email/, bad)
  }
})

test('exactly 13 digits is accepted as a client ID number', () => {
  assert.deepEqual(parseUsername('8001015009087'), { kind: 'id', value: '8001015009087' })
  assert.deepEqual(parseUsername(' 8001015009087 '), { kind: 'id', value: '8001015009087' })
})

test('digits of any other length are rejected with the 13-digit message', () => {
  for (const bad of ['800101500908', '80010150090871', '1', '00000']) {
    assert.match(parseUsername(bad).error, /exactly 13 digits/, bad)
  }
})

test('empty input and names that are neither an email nor an ID are rejected', () => {
  for (const bad of [undefined, null, '', '   ']) assert.match(parseUsername(bad).error, /Enter your username/)
  for (const bad of ['jsmith', '8001015009O87', '800101-5009087']) assert.match(parseUsername(bad).error, /email address.*13-digit/, bad)
})
