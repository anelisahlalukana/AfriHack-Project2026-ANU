// Pure logic for the advisor's Reminders page: what state a reminder is in, and how the
// list is filtered and sorted. No React in here so it can be tested on its own.
// All dates are plain YYYY-MM-DD strings in South African time, as the server stores them.

export const AUDIENCE_LABELS = { client: 'Client', adviser: 'Advisers', both: 'Client and advisers' }
export const audienceLabel = audience => AUDIENCE_LABELS[audience] || audience

export const recurrenceLabel = months => (months ? `Every ${months} month${months === 1 ? '' : 's'}` : 'One time')

export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

const dayNumber = key => Math.floor(Date.parse(`${key}T00:00:00Z`) / 86400000)

// Whole days from `today` until `dueDate` (negative when the date has passed).
export const daysUntil = (dueDate, today) => dayNumber(dueDate) - dayNumber(today)

// completed: an adviser marked it done. sent: a one-time reminder that has already notified people.
// Otherwise it is still waiting: overdue (date passed but not yet sent), today, or upcoming.
export function reminderState(reminder, today) {
  if (reminder.status === 'completed') return 'completed'
  if (reminder.status === 'notified') return 'sent'
  const days = daysUntil(reminder.dueDate, today)
  return days < 0 ? 'overdue' : days === 0 ? 'today' : 'upcoming'
}

export const STATE_LABELS = { overdue: 'Overdue', today: 'Due today', upcoming: 'Upcoming', sent: 'Sent', completed: 'Completed' }

const BADGE_CLASSES = { overdue: 'badge status-flagged', today: 'badge status-sent', upcoming: 'badge', sent: 'badge', completed: 'badge status-signed' }
export const stateBadgeClass = state => BADGE_CLASSES[state] || 'badge'

export function relativeDue(dueDate, today) {
  const days = daysUntil(dueDate, today)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  return days > 0 ? `In ${days} days` : `${-days} days ago`
}

export const VIEWS = [
  { key: 'open', label: 'Open', states: ['overdue', 'today', 'upcoming'] },
  { key: 'overdue', label: 'Overdue', states: ['overdue'] },
  { key: 'done', label: 'Done', states: ['sent', 'completed'] },
  { key: 'all', label: 'All', states: ['overdue', 'today', 'upcoming', 'sent', 'completed'] },
]

const STATE_ORDER = ['overdue', 'today', 'upcoming', 'sent', 'completed']

export function countByView(reminders, today) {
  const counts = Object.fromEntries(VIEWS.map(view => [view.key, 0]))
  for (const reminder of reminders) {
    const state = reminderState(reminder, today)
    for (const view of VIEWS) if (view.states.includes(state)) counts[view.key] += 1
  }
  return counts
}

// `nameOf(clientId)` gives the client's display name, so search can match it too.
export function filterReminders(reminders, { view = 'open', clientId = '', query = '' } = {}, today, nameOf = () => '') {
  const allowed = (VIEWS.find(item => item.key === view) || VIEWS[0]).states
  const needle = query.trim().toLowerCase()

  return reminders.filter(reminder => {
    if (!allowed.includes(reminderState(reminder, today))) return false
    if (clientId && reminder.clientId !== clientId) return false
    if (!needle) return true
    return `${reminder.title} ${nameOf(reminder.clientId)}`.toLowerCase().includes(needle)
  })
}

// Needs attention first (overdue, today, upcoming), then finished ones; earliest date first within each group.
export function sortReminders(reminders, today) {
  const rank = reminder => STATE_ORDER.indexOf(reminderState(reminder, today))
  return [...reminders].sort((a, b) => rank(a) - rank(b) || a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title))
}

export function dateLabel(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}
