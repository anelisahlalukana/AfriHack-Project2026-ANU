import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isStaff, isAdmin, accountHome, loginDestination } from '../src/lib/authRoles.js'

test('public accounts, editable metadata, and non-staff roles cannot grant staff access', () => {
  for (const user of [
    undefined,
    {},
    { user_metadata: { role: 'advisor' } },
    { app_metadata: { role: 'client' } },
    { app_metadata: { role: 'provider' } }, // mocked integration layer, never a login role
    { app_metadata: { role: 'broker' } }, // merged into 'advisor'
    { app_metadata: { role: 'unexpected' } },
  ]) {
    assert.equal(isStaff(user), false)
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
