import { money } from './financials.js'
import { plural } from './dashboardFormat.js'
import { waitingLabel } from './taskFormat.js'

// `label` is the badge text; `phrase` reads as a sentence ("High risk · score 14").
const RISK_BADGES = {
  high: { label: 'High', phrase: 'High risk', className: 'badge status-flagged' },
  medium: { label: 'Medium', phrase: 'Medium risk', className: 'badge status-sent' },
  low: { label: 'Not at risk', phrase: 'Not at risk', className: 'badge status-signed' },
}
export const riskBadge = level => RISK_BADGES[level] || RISK_BADGES.low

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// A timestamp or a plain YYYY-MM-DD date as "19 Sep 2026". Written out by hand rather than with
// toLocaleDateString, whose output differs between browsers and Node versions. A plain date is
// taken as written so it never slips to the previous day.
export function signalDate(value) {
  if (!value) return ''
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (plain) return `${Number(plain[3])} ${MONTHS[Number(plain[2]) - 1]} ${plain[1]}`
  const date = new Date(value)
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

// "Showing the 5 highest-risk of 12 clients that need attention." when the ranking is cut off.
export function rankingNote({ flaggedTotal, clients }) {
  return flaggedTotal > clients.length
    ? `Showing the ${clients.length} highest-risk of ${flaggedTotal} clients that need attention.`
    : ''
}

// The supporting lines under a signal in the drill-down, from the data behind it.
export function signalDetails(signal) {
  switch (signal.kind) {
    case 'document':
      return [`Sent to the client on ${signalDate(signal.since)}`]
    case 'task':
      return [
        [signal.reference, signal.title || signal.typeLabel].filter(Boolean).join(' · '),
        [`Last updated ${signalDate(signal.since)}`, waitingLabel(signal.waitingOn)].filter(Boolean).join(' · '),
      ]
    case 'goal':
      return [
        signal.targetAmount > 0 ? `${money(signal.currentProgress)} of ${money(signal.targetAmount)} saved` : 'No target amount set',
        signal.targetDate ? `Target date ${signalDate(signal.targetDate)}` : 'No target date',
      ]
    case 'onboarding': {
      const total = signal.signed + signal.awaitingClient + signal.notSent
      return [
        `${signal.signed} of ${total} documents signed`,
        [signal.awaitingClient > 0 && `${signal.awaitingClient} awaiting the client`, signal.notSent > 0 && `${signal.notSent} not sent`].filter(Boolean).join(' · '),
      ].filter(Boolean)
    }
    case 'reminder':
      return signal.reminders.map(reminder => `${reminder.title} · due ${signalDate(reminder.triggerDate)} · ${plural(reminder.daysOverdue, 'day')} overdue`)
    default:
      return []
  }
}
