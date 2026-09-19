// Only administrator-controlled app metadata grants workspace access.
// Staff are admins and advisors. Providers (insurers) sign in to their own
// portal at /provider and are not staff: they only see the claims and requests
// sent to their organisation (app_metadata.provider_id).
export function isStaff(user) {
  return ['admin', 'advisor'].includes(user?.app_metadata?.role)
}
export function isAdmin(user) {
  return user?.app_metadata?.role === 'admin'
}
export function isProvider(user) {
  return user?.app_metadata?.role === 'provider'
}
export function accountHome(user) {
  if (isProvider(user)) return '/provider'
  if (!isStaff(user)) return '/account'
  return isAdmin(user) ? '/admin' : '/'
}
function isSafePath(from) {
  return typeof from === 'string' && /^\/(?![\\/])/.test(from) && !/^\/(login|signup)([/?#]|$)/.test(from)
}
export function loginDestination(user, from) {
  if (isProvider(user)) return isSafePath(from) && /^\/provider([/?#]|$)/.test(from) ? from : '/provider'
  if (!isStaff(user)) return '/account'
  if (isSafePath(from)) return from
  return accountHome(user)
}
