import { plural } from './dashboardFormat.js'
import { NOT_ASSESSED, RISK_CATEGORIES } from './clientTable.js'

// Turns the dashboard payload (GET /api/dashboard) into the rows the dashboard charts draw.
// Pure, so it can be tested without a browser.

// Everything waiting for the adviser to act, one row per queue. `urgent` rows draw in red.
export function attentionRows({ work, documents, onboarding, reminders, clients }) {
  return [
    {
      key: 'waiting_on_us', label: 'Waiting on us', value: work.waitingOnUs, to: '/tasks', urgent: work.overdue > 0,
      detail: work.overdue ? `${work.overdue} overdue (48h+)` : 'Nothing overdue',
    },
    {
      key: 'documents', label: 'Documents to sign', value: documents.awaitingSignature, to: '/clients',
      detail: documents.awaitingSignature ? `Longest wait: ${plural(documents.oldestWaitingDays, 'day')}` : 'Nothing waiting on clients',
    },
    {
      key: 'onboarding', label: 'Stalled onboarding', value: onboarding.stalled, to: '/clients?status=onboarding', urgent: onboarding.stalled > 0,
      detail: `Onboarding for ${onboarding.stalledAfterDays}+ days`,
    },
    {
      key: 'consents', label: 'Consents to renew', value: documents.consentsExpired + documents.consentsExpiringSoon, to: '/clients', urgent: documents.consentsExpired > 0,
      detail: `${documents.consentsExpired} expired · ${documents.consentsExpiringSoon} expiring within ${documents.consentWarningDays} days`,
    },
    {
      key: 'reminders', label: 'Reminders overdue', value: reminders.overdue, to: '/reminders', urgent: reminders.overdue > 0,
      detail: `${reminders.dueSoon} due in the next ${reminders.dueSoonDays} days`,
    },
    {
      key: 'analysis', label: 'Needs financial analysis', value: clients.noFinancialAnalysis, to: '/clients',
      detail: 'No financial items recorded yet',
    },
  ]
}

export const hasAttention = rows => rows.some(row => row.value > 0)

const capitalise = text => text.charAt(0).toUpperCase() + text.slice(1)

// Clients per risk profile, in the order of the profiles themselves (cautious to bold), then any
// category outside that list, then clients who haven't been assessed. Bars link to the Clients
// table filtered to that profile; a category the table can't filter by gets no link.
export function riskRows(riskMix = {}) {
  const other = Object.keys(riskMix).filter(key => key !== 'not_assessed' && !RISK_CATEGORIES.includes(key))
  return [
    ...RISK_CATEGORIES.map(key => ({ key, label: capitalise(key), value: riskMix[key] || 0, to: `/clients?risk=${key}` })),
    ...other.map(key => ({ key, label: capitalise(key.replaceAll('_', ' ')), value: riskMix[key], to: null })),
    { key: 'not_assessed', label: 'Not assessed', value: riskMix.not_assessed || 0, to: `/clients?risk=${NOT_ASSESSED}` },
  ]
}

export const total = rows => rows.reduce((sum, row) => sum + row.value, 0)
