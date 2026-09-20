const LABELS = { compliant: 'Compliant', attention: 'Attention', action_required: 'Action required',
  valid: 'Valid', expiring: 'Expiring soon', expired: 'Expired', not_signed: 'Not signed', invalid: 'Review record',
  clear: 'Clear', flagged: 'Flagged', not_screened: 'Not screened', allowed: 'Allowed', blocked: 'Blocked',
  unavailable: 'Unavailable', signed: 'Signed', updated: 'Updated', recorded: 'Recorded' }
export function complianceLabel(value) { return LABELS[value] || value || 'Unknown' }
export function complianceBadge(value) {
  if (['compliant', 'valid', 'clear', 'allowed', 'signed', 'up_to_date', 'qualified'].includes(value)) return 'badge status-signed'
  if (['attention', 'expiring', 'pending', 'in_progress'].includes(value)) return 'badge status-sent'
  return 'badge status-flagged'
}
export function complianceDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(date)
}
export function cpdPercent(hours, required) {
  if (!Number.isFinite(hours) || !Number.isFinite(required) || required <= 0) return 0
  return Math.min(100, Math.max(0, hours / required * 100))
}
export function southAfricaToday(now = new Date()) {
  return new Date(new Date(now).getTime() + 2 * 3600000).toISOString().slice(0, 10)
}
