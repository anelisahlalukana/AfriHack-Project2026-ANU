// The sign-in "Username" box takes one of two things:
//   - an email address: advisors and admins
//   - a 13-digit ID number: clients
// Returns { kind: 'email' | 'id', value } when valid, or { error } with a message to show.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ID_NUMBER_PATTERN = /^\d{13}$/

export function parseUsername(input) {
  const value = String(input ?? '').trim()

  if (!value) return { error: 'Enter your username.' }
  if (value.includes('@')) {
    if (!EMAIL_PATTERN.test(value)) return { error: 'Enter a valid email address, e.g. name@example.com.' }
    return { kind: 'email', value }
  }
  if (ID_NUMBER_PATTERN.test(value)) return { kind: 'id', value }
  if (/^\d+$/.test(value)) return { error: 'Your ID number must be exactly 13 digits.' }
  return { error: 'Advisers and admins: enter your email address. Clients: enter your 13-digit ID number.' }
}
