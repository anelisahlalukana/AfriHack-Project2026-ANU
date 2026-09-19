// Only administrator-controlled app metadata grants workspace access.
// 'provider' is not a logged-in role — it's the mocked external
// insurer/integration layer (see docs/system_requirments.md). Only admin and
// advisor are real staff logins.
export function isStaff(user) {
  return ['admin', 'advisor'].includes(user?.app_metadata?.role)
}
export function isAdmin(user) {
  return user?.app_metadata?.role === 'admin'
}
export function accountHome(user) {
  if (!isStaff(user)) return '/account'
  return isAdmin(user) ? '/admin' : '/'
}
export function loginDestination(user, from) {
  if (!isStaff(user)) return '/account'
  if (typeof from === 'string' && /^\/(?![\\/])/.test(from) && !/^\/(login|signup)([/?#]|$)/.test(from)) {
    return from
  }
  return accountHome(user)
}
