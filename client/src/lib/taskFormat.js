// Display helpers for claims and requests (pure functions, unit-tested).

export const STATUS_LABELS = {
  draft: 'Draft',
  open: 'In progress',
  awaiting_client: 'Needs you',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
}

export function statusLabel(status, viewer = 'client') {
  if (status === 'awaiting_client' && viewer === 'staff') return 'Waiting on client'
  return STATUS_LABELS[status] || status
}

export function statusTone(status) {
  if (status === 'awaiting_client') return 'red'
  if (status === 'completed') return 'ok'
  if (status === 'declined' || status === 'cancelled') return 'muted'
  if (status === 'draft') return 'warn'
  return ''
}

export function waitingLabel(waitingOn, providerName, viewer = 'staff') {
  if (!waitingOn) return ''
  if (viewer === 'provider') return { client: 'Waiting on the client', provider: 'Waiting on you', us: 'With Royal Square' }[waitingOn] || ''
  if (waitingOn === 'client') return viewer === 'client' ? 'Waiting on you' : 'Waiting on client'
  if (waitingOn === 'provider') return `Waiting on ${providerName || 'the provider'}`
  return viewer === 'client' ? 'With your adviser' : 'Waiting on us'
}

export function progressText(progress) {
  if (!progress) return ''
  if (progress.declined) return 'Declined'
  if (!progress.step) return `Not started · ${progress.total} steps`
  return `Step ${progress.step} of ${progress.total}`
}

export function actorName(update) {
  if (update.actor_label) return update.actor_label
  return { client: 'Client', adviser: 'Royal Square', provider: 'Provider', system: 'Royal Square' }[update.actor_type] || 'Royal Square'
}

const DATE_TIME = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const DATE_ONLY = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })

export function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : DATE_TIME.format(date)
}

export function formatDate(value) {
  if (!value) return ''
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? String(value) : DATE_ONLY.format(date)
}

export function fileSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const MONEY = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

// Turns a submitted form into label/value rows for display, in config order.
export function formRows(fields = [], form = {}) {
  return fields
    .filter(field => form[field.key] !== undefined && form[field.key] !== null && form[field.key] !== '')
    .map(field => {
      const value = form[field.key]
      let text
      if (field.type === 'boolean') text = value ? 'Yes' : 'No'
      else if (field.type === 'date') text = formatDate(value)
      else if (field.type === 'datetime') text = formatDateTime(value)
      else if (field.type === 'financial_items') text = value.map(item => `${item.item_type} (${item.category}) ${MONEY.format(item.amount)}`).join('; ')
      else if (field.type === 'number' && /ZAR/.test(field.label)) text = MONEY.format(value)
      else text = String(value)
      return { key: field.key, label: field.label, value: text }
    })
}

// Local "YYYY-MM-DD" for date inputs (today, in the browser's time zone).
export function todayInputValue(now = new Date()) {
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

// api/http.js already puts the backend's { error } message on error.message.
export function errorMessage(error) {
  return error?.message || 'Something went wrong. Please try again.'
}

// Providers that can handle a claim category (requests may use any provider).
export function providersFor(providers = [], category) {
  if (!category) return providers
  return providers.filter(provider => (provider.product_lines || []).includes(category))
}

// Default values for a config-driven form (financial item lists start with one row).
export function dynamicDefaults(fields = [], saved = {}) {
  return Object.fromEntries(fields.map(field => {
    if (saved[field.key] !== undefined) return [field.key, saved[field.key]]
    if (field.type === 'financial_items') return [field.key, [{ category: 'asset', item_type: '', amount: '' }]]
    if (field.type === 'boolean') return [field.key, false]
    return [field.key, '']
  }))
}

// Drops blank answers so optional fields aren't sent as empty strings.
export function compactForm(values = {}) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '' && value !== null && value !== undefined))
}
