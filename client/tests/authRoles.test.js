import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isStaff, accountHome, loginDestination } from '../src/lib/authRoles.js'

test('public accounts and editable metadata cannot grant staff access', () => {
  for (const user of [undefined, {}, { user_metadata: { role: 'broker' } }, { app_metadata: { role: 'client' } }, { app_metadata: { role: 'unexpected' } }]) {
    assert.equal(isStaff(user), false)
    assert.equal(accountHome(user), '/account')
    assert.equal(loginDestination(user, '/clients/new'), '/account')
  }
})
test('only administrator-assigned staff roles open the workspace', () => {
  for (const role of ['advisor', 'provider', 'broker']) {
    const user = { app_metadata: { role } }
    assert.equal(isStaff(user), true)
    assert.equal(accountHome(user), '/')
    assert.equal(loginDestination(user, '/clients/123/edit?section=goals#form'), '/clients/123/edit?section=goals#form')
  }
})
test('login redirects reject external destinations and auth loops', () => {
  const user = { app_metadata: { role: 'broker' } }
  for (const from of ['https://example.com', '//example.com', '/\\example.com', '/login', '/signup?next=test', null, {}]) {
    assert.equal(loginDestination(user, from), '/')
  }
})
