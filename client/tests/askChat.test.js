import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSteps, emptyAnswers, applyAnswer, validateAnswer, answerText, summaryLines, buildRequest } from '../src/lib/askChat.js'

const providers = [{ id: 'p1', name: 'Discovery' }, { id: 'p2', name: 'Sanlam' }]
// Mirrors real request types from the catalog.
const banking = { task_type: 'banking_change', requires_provider: true, required_documents: [{ key: 'bank_confirmation', label: 'Bank confirmation letter', required: true }], form_fields: [
  { key: 'bank_name', type: 'text', label: 'Bank name', required: true },
  { key: 'bank_account_number', type: 'text', label: 'Account number', required: true },
  { key: 'bank_account_type', type: 'select', label: 'Account type', required: true, options: ['Cheque', 'Savings', 'Transmission'] },
] }
const consult = { task_type: 'consultation_request', requires_provider: false, required_documents: [], form_fields: [
  { key: 'preferred_date', type: 'date', label: 'Preferred date', required: true },
  { key: 'format', type: 'select', label: 'Format', required: true, options: ['In person', 'Video call', 'Phone call'] },
  { key: 'topic', type: 'textarea', label: 'What would you like to discuss', required: true, hint: 'A sentence or two is plenty' },
] }
const balance = { task_type: 'client_info_update', requires_provider: false, required_documents: [{ key: 'supporting_statements', label: 'Supporting statements', required: false }], form_fields: [
  { key: 'items', type: 'financial_items', label: 'Balance sheet items', required: true },
  { key: 'notes', type: 'textarea', label: 'Notes', required: false },
] }
const stepOf = (steps, id) => steps.find(step => step.id === id)

test('a type that needs a provider starts with the provider and policy number, then its fields, then documents', () => {
  const steps = buildSteps(banking, providers)
  assert.deepEqual(steps.map(step => step.id), ['provider', 'policyNumber', 'form.bank_name', 'form.bank_account_number', 'form.bank_account_type', 'doc.bank_confirmation'])
  assert.deepEqual(steps[0].options, [{ value: 'p1', label: 'Discovery' }, { value: 'p2', label: 'Sanlam' }])
  assert.equal(steps[1].required, false)
  assert.equal(steps.at(-1).kind, 'file')
  assert.equal(steps.at(-1).required, false) // documents can always be added later
})

test('a type without a provider has no provider or policy questions; hints are added to the prompt', () => {
  const steps = buildSteps(consult)
  assert.deepEqual(steps.map(step => step.id), ['form.preferred_date', 'form.format', 'form.topic'])
  assert.deepEqual(steps.map(step => step.kind), ['date', 'choice', 'textarea'])
  assert.equal(steps[2].prompt, 'What would you like to discuss. A sentence or two is plenty')
  assert.equal(steps[0].prompt, 'Preferred date?')
})

test('text answers are trimmed; required ones cannot be empty; optional ones can be skipped', () => {
  const [bank, , policy] = [stepOf(buildSteps(banking, providers), 'form.bank_name'), null, stepOf(buildSteps(banking, providers), 'policyNumber')]
  assert.deepEqual(validateAnswer(bank, '  Standard Bank  '), { value: 'Standard Bank' })
  assert.match(validateAnswer(bank, '   ').error, /need an answer/)
  assert.deepEqual(validateAnswer(policy, ''), { value: '' })
  assert.match(validateAnswer(policy, 'x'.repeat(61)).error, /60 characters/)
})

test('numbers must be zero or more', () => {
  const step = { kind: 'number', required: true }
  assert.deepEqual(validateAnswer(step, ' 25 '), { value: '25' })
  assert.deepEqual(validateAnswer(step, '0'), { value: '0' })
  for (const bad of ['-1', 'abc', '1e', '']) assert.ok(validateAnswer(step, bad).error, bad)
  assert.deepEqual(validateAnswer({ kind: 'number', required: false }, ''), { value: '' })
})

test('dates must be real calendar dates', () => {
  const step = { kind: 'date', required: true }
  assert.deepEqual(validateAnswer(step, '2026-09-30'), { value: '2026-09-30' })
  for (const bad of ['2026-02-30', '30/09/2026', 'tomorrow', '']) assert.ok(validateAnswer(step, bad).error, bad)
})

test('a choice must be one of the options', () => {
  const step = stepOf(buildSteps(consult), 'form.format')
  assert.deepEqual(validateAnswer(step, 'Video call'), { value: 'Video call' })
  assert.ok(validateAnswer(step, 'Carrier pigeon').error)
  assert.ok(validateAnswer(step, '').error)
})

test('financial items: blank rows are dropped, each kept row needs a type, description and amount', () => {
  const step = stepOf(buildSteps(balance), 'form.items')
  const ok = validateAnswer(step, [{ category: 'asset', item_type: ' Unit trust ', amount: '15000' }, { category: 'asset', item_type: '', amount: '' }])
  assert.deepEqual(ok, { value: [{ category: 'asset', item_type: 'Unit trust', amount: '15000' }] })
  assert.match(validateAnswer(step, []).error, /at least one/)
  assert.match(validateAnswer(step, [{ category: 'asset', item_type: '', amount: '5' }]).error, /describe/)
  assert.match(validateAnswer(step, [{ category: 'asset', item_type: 'Loan', amount: '-5' }]).error, /amount/)
  assert.match(validateAnswer(step, [{ category: 'nonsense', item_type: 'Loan', amount: '5' }]).error, /type/)
})

test('a file can be attached or skipped', () => {
  const step = stepOf(buildSteps(banking, providers), 'doc.bank_confirmation')
  const file = { name: 'letter.pdf' }
  assert.deepEqual(validateAnswer(step, file), { value: file })
  assert.deepEqual(validateAnswer(step, null), { value: null })
})

test('answers read back naturally in the chat', () => {
  const steps = buildSteps(consult)
  assert.equal(answerText(stepOf(steps, 'form.format'), 'Video call'), 'Video call')
  assert.match(answerText(stepOf(steps, 'form.preferred_date'), '2026-09-30'), /30/)
  assert.equal(answerText(stepOf(steps, 'form.topic'), ''), 'Skipped')
  assert.equal(answerText({ kind: 'boolean' }, true), 'Yes')
  assert.equal(answerText({ kind: 'file' }, { name: 'letter.pdf' }), 'letter.pdf')
  const items = answerText({ kind: 'financial' }, [{ category: 'liability', item_type: 'Home loan', amount: '850000' }])
  assert.match(items, /^Liability: Home loan, R 850.000$/u)
  const providerStep = stepOf(buildSteps(banking, providers), 'provider')
  assert.equal(answerText(providerStep, 'p2'), 'Sanlam')
})

test('answers are collected in the right place and never mutate the previous answers', () => {
  const steps = buildSteps(banking, providers)
  const start = emptyAnswers()
  const file = { name: 'letter.pdf' }
  let answers = applyAnswer(start, stepOf(steps, 'provider'), 'p1')
  answers = applyAnswer(answers, stepOf(steps, 'policyNumber'), 'POL-1')
  answers = applyAnswer(answers, stepOf(steps, 'form.bank_name'), 'FNB')
  answers = applyAnswer(answers, stepOf(steps, 'doc.bank_confirmation'), file)
  assert.deepEqual(answers, { form: { bank_name: 'FNB' }, providerId: 'p1', policyNumber: 'POL-1', files: { bank_confirmation: file } })
  assert.deepEqual(start, emptyAnswers())
})

test('the request sent to the server matches the old form: provider, policy number, compacted form, then files', () => {
  const answers = { form: { bank_name: 'FNB', bank_account_number: '123', bank_account_type: 'Savings', note: '' }, providerId: 'p1', policyNumber: '', files: { bank_confirmation: { name: 'l.pdf' } } }
  const { payload, files } = buildRequest(banking, answers)
  assert.deepEqual(payload, { taskType: 'banking_change', form: { bank_name: 'FNB', bank_account_number: '123', bank_account_type: 'Savings' }, providerId: 'p1', policyNumber: '' })
  assert.deepEqual(files, [{ documentKey: 'bank_confirmation', file: { name: 'l.pdf' } }])
  const noProvider = buildRequest(consult, { ...emptyAnswers(), form: { preferred_date: '2026-10-01', format: 'Phone call', topic: 'Retirement' } })
  assert.deepEqual(Object.keys(noProvider.payload), ['taskType', 'form'])
  assert.deepEqual(noProvider.files, [])
})

test('the summary lists every question with its answer, including skipped ones', () => {
  const steps = buildSteps(banking, providers)
  const lines = summaryLines(steps, { form: { bank_name: 'FNB', bank_account_number: '123', bank_account_type: 'Savings' }, providerId: 'p1', policyNumber: '', files: {} })
  assert.deepEqual(lines, ['Provider: Discovery', 'Policy number: Skipped', 'Bank name: FNB', 'Account number: 123', 'Account type: Savings', 'Bank confirmation letter: Skipped'])
})
