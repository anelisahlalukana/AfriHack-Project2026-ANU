import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isStaff, isAdmin, isProvider, accountHome, loginDestination } from '../src/lib/authRoles.js'

test('public accounts, editable metadata, and non-staff roles cannot grant staff access', () => {
  for (const user of [
    undefined,
    {},
    { user_metadata: { role: 'advisor' } },
    { app_metadata: { role: 'client' } },
    { app_metadata: { role: 'broker' } }, // merged into 'advisor'
    { app_metadata: { role: 'unexpected' } },
  ]) {
    assert.equal(isStaff(user), false)
    assert.equal(isProvider(user), false)
    assert.equal(accountHome(user), '/account')
    assert.equal(loginDestination(user, '/clients/new'), '/account')
  }
})
test('advisor opens the client workspace at /', () => {
  const user = { app_metadata: { role: 'advisor' } }
  assert.equal(isStaff(user), true)
  assert.equal(isAdmin(user), false)
  assert.equal(accountHome(user), '/')
  assert.equal(loginDestination(user, null), '/')
  assert.equal(loginDestination(user, '/clients/123/edit?section=goals#form'), '/clients/123/edit?section=goals#form')
})
test('admin opens the admin area at /admin, separate from the client workspace', () => {
  const user = { app_metadata: { role: 'admin' } }
  assert.equal(isStaff(user), true)
  assert.equal(isAdmin(user), true)
  assert.equal(accountHome(user), '/admin')
  assert.equal(loginDestination(user, null), '/admin')
})
test('login redirects reject external destinations and auth loops', () => {
  const user = { app_metadata: { role: 'advisor' } }
  for (const from of ['https://example.com', '//example.com', '/\\example.com', '/login', '/signup?next=test', null, {}]) {
    assert.equal(loginDestination(user, from), '/')
  }
})
test('providers are not staff and only land in the provider portal', () => {
  const user = { app_metadata: { role: 'provider', provider_id: 'x' } }
  assert.equal(isStaff(user), false)
  assert.equal(isProvider(user), true)
  assert.equal(accountHome(user), '/provider')
  assert.equal(loginDestination(user, null), '/provider')
  assert.equal(loginDestination(user, '/provider/tasks/123'), '/provider/tasks/123')
  for (const from of ['/clients/new', '/account', '/admin', '/providers', 'https://example.com']) {
    assert.equal(loginDestination(user, from), '/provider')
  }
  // Only app_metadata counts: a user can edit user_metadata themselves.
  assert.equal(isProvider({ user_metadata: { role: 'provider' } }), false)
})
