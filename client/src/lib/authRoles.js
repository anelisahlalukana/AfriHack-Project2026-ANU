// Only administrator-controlled app metadata grants workspace access.
export function isStaff(user) {
  return ['advisor', 'provider', 'broker'].includes(user?.app_metadata?.role)
}
export function accountHome(user) {
  return isStaff(user) ? '/' : '/account'
}
export function loginDestination(user, from) {
  if (!isStaff(user)) return '/account'
  return typeof from === 'string' && /^\/(?![\\/])/.test(from) && !/^\/(login|signup)([/?#]|$)/.test(from)
    ? from : '/'
}
