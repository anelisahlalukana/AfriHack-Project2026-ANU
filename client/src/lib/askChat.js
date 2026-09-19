import { compactForm, formatDate } from './taskFormat.js'

// Pure logic behind the "Ask for something" chat. A request type from the catalog (its form
// fields, required documents and whether it needs a provider) is turned into a list of steps;
// the chat asks them one at a time, checks each answer, and finally builds the same payload the
// old form sent. No React in here so it can be tested on its own.

export const FINANCIAL_CATEGORIES = [['asset', 'Asset'], ['liability', 'Liability'], ['income', 'Income'], ['expense', 'Expense']]

const KIND_BY_FIELD_TYPE = { textarea: 'textarea', select: 'choice', date: 'date', datetime: 'datetime', number: 'number', financial_items: 'financial', boolean: 'boolean' }

// kind is one of: choice, boolean, text, textarea, number, date, datetime, financial, file
export function buildSteps(type, providers = []) {
  const steps = []

  if (type.requires_provider) {
    steps.push({ id: 'provider', kind: 'choice', label: 'Provider', prompt: 'Which provider is this for?', required: true, options: providers.map(provider => ({ value: provider.id, label: provider.name })) })
    steps.push({ id: 'policyNumber', kind: 'text', label: 'Policy number', prompt: "What is your policy number? Skip this if you don't have it to hand.", required: false, maxLength: 60 })
  }

  for (const field of type.form_fields || []) {
    steps.push({
      id: `form.${field.key}`,
      key: field.key,
      kind: KIND_BY_FIELD_TYPE[field.type] || 'text',
      label: field.label,
      prompt: field.hint ? `${field.label}. ${field.hint}` : `${field.label}?`,
      required: Boolean(field.required),
      options: (field.options || []).map(option => ({ value: option, label: option })),
    })
  }

  for (const doc of type.required_documents || []) {
    steps.push({
      id: `doc.${doc.key}`,
      key: doc.key,
      kind: 'file',
      label: doc.label,
      prompt: `Please attach: ${doc.label}.${doc.required ? ' You can also add it later from the request page.' : ' This one is optional.'}`,
      required: false,
    })
  }

  return steps
}

export const emptyAnswers = () => ({ form: {}, providerId: '', policyNumber: '', files: {} })

// Returns a new answers object with the step's value stored in the right place.
export function applyAnswer(answers, step, value) {
  if (step.id === 'provider') return { ...answers, providerId: value }
  if (step.id === 'policyNumber') return { ...answers, policyNumber: value }
  if (step.id.startsWith('doc.')) return { ...answers, files: { ...answers.files, [step.key]: value } }
  return { ...answers, form: { ...answers.form, [step.key]: value } }
}

const isValidDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value

// Checks what the person typed or picked. Returns { value } (cleaned) or { error } (a message the chat says back).
export function validateAnswer(step, raw) {
  const skip = { value: step.kind === 'financial' ? [] : step.kind === 'file' ? null : '' }

  switch (step.kind) {
    case 'text':
    case 'textarea': {
      const value = String(raw ?? '').trim()
      if (!value) return step.required ? { error: 'I need an answer for this one.' } : skip
      if (step.maxLength && value.length > step.maxLength) return { error: `Please keep it to ${step.maxLength} characters or fewer.` }
      return { value }
    }
    case 'number': {
      const value = String(raw ?? '').trim()
      if (!value) return step.required ? { error: 'I need a number for this one.' } : skip
      if (!Number.isFinite(Number(value)) || Number(value) < 0) return { error: 'Please enter a number, zero or more.' }
      return { value }
    }
    case 'date': {
      const value = String(raw ?? '').trim()
      if (!value) return step.required ? { error: 'Please choose a date.' } : skip
      return isValidDate(value) ? { value } : { error: "That doesn't look like a valid date." }
    }
    case 'datetime': {
      const value = String(raw ?? '').trim()
      if (!value) return step.required ? { error: 'Please choose a date and time.' } : skip
      return Number.isFinite(Date.parse(value)) ? { value } : { error: "That doesn't look like a valid date and time." }
    }
    case 'choice': {
      if (raw === '' || raw == null) return step.required ? { error: 'Please pick one of the options.' } : skip
      return step.options.some(option => option.value === raw) ? { value: raw } : { error: 'Please pick one of the options.' }
    }
    case 'boolean':
      return raw === true || raw === false ? { value: raw } : { error: 'Please answer yes or no.' }
    case 'financial': {
      const rows = (Array.isArray(raw) ? raw : []).map(row => ({ category: row.category, item_type: String(row.item_type ?? '').trim(), amount: String(row.amount ?? '').trim() }))
        .filter(row => row.item_type || row.amount)
      if (!rows.length) return step.required ? { error: 'Please add at least one item.' } : skip
      for (const row of rows) {
        if (!FINANCIAL_CATEGORIES.some(([value]) => value === row.category)) return { error: 'Please choose a type for each item.' }
        if (!row.item_type) return { error: 'Please describe each item, for example "Unit trust" or "Home loan".' }
        if (!Number.isFinite(Number(row.amount)) || row.amount === '' || Number(row.amount) < 0) return { error: 'Each item needs an amount of zero or more.' }
      }
      return { value: rows }
    }
    case 'file':
      return raw ? { value: raw } : skip
    default:
      return { error: 'Something went wrong with that question.' }
  }
}

const money = value => `R ${Number(value).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}`

// How an answer reads back in the chat (and in the summary before sending).
export function answerText(step, value) {
  if (value === '' || value == null || (Array.isArray(value) && !value.length)) return 'Skipped'
  switch (step.kind) {
    case 'choice': return step.options.find(option => option.value === value)?.label ?? String(value)
    case 'boolean': return value ? 'Yes' : 'No'
    case 'date': return formatDate(value)
    case 'financial': return value.map(row => `${FINANCIAL_CATEGORIES.find(([key]) => key === row.category)?.[1] ?? row.category}: ${row.item_type}, ${money(row.amount)}`).join('\n')
    case 'file': return value.name
    default: return String(value)
  }
}

export function summaryLines(steps, answers) {
  const valueFor = step => {
    if (step.id === 'provider') return answers.providerId
    if (step.id === 'policyNumber') return answers.policyNumber
    if (step.id.startsWith('doc.')) return answers.files[step.key]
    return answers.form[step.key]
  }
  return steps.map(step => `${step.label}: ${answerText(step, valueFor(step))}`)
}

// The payload createRequest expects, and the documents to upload once the request exists.
export function buildRequest(type, answers) {
  return {
    payload: {
      taskType: type.task_type,
      form: compactForm(answers.form),
      ...(type.requires_provider ? { providerId: answers.providerId, policyNumber: answers.policyNumber } : {}),
    },
    files: (type.required_documents || []).filter(doc => answers.files[doc.key]).map(doc => ({ documentKey: doc.key, file: answers.files[doc.key] })),
  }
}
