import { test } from 'node:test'
import assert from 'node:assert/strict'
import { profileDefaults, profilePayload, getValue, setValue, validateProfileField } from '../src/lib/extendedProfile.js'
import { profileSections } from '../src/constants/profileSections.js'

test('existing column values take precedence and bank account leading zeros survive', () => {
  const values = profileDefaults({ first_name: 'Jane', bank_account_number: '0012345', extended_profile: { personal: { firstName: 'Stale', maidenName: 'Smith' }, banking: { salary: { branchCode: '000012' } } } })
  assert.equal(values.personal.firstName, 'Jane')
  assert.equal(values.personal.maidenName, 'Smith')
  const saved = profilePayload(values)
  assert.equal(saved.columns.bank_account_number, '0012345')
  assert.equal(saved.extra.banking.salary.branchCode, '000012')
  assert.equal(saved.extra.personal.firstName, undefined)
})
test('all additional sections round trip without overwriting financial goals', () => {
  const values = profileDefaults({})
  for (const section of profileSections) for (const field of section.fields) {
    setValue(values, field.path, field.type === 'number' ? '1' : field.type === 'date' ? '2020-01-01' : 'Example')
  }
  values.dependantsBeneficiaries = [{ id: 'existing-id', full_name: 'Child', beneficiary_percentage: '100' }]
  values.planningGoals.immediate = [{ text: ' Build emergency fund ' }]
  values.planningGoals.longTerm = [{ text: 'Retire' }]
  const payload = profilePayload(values)
  const reread = profileDefaults({ ...payload.columns, extended_profile: payload.extra, client_dependants: payload.dependants, client_goals: [{ goal_name: 'Untouched financial goal' }] })
  for (const section of profileSections) for (const field of section.fields) assert.equal(getValue(reread, field.path), getValue(values, field.path))
  assert.equal(reread.dependantsBeneficiaries[0].id, 'existing-id')
  assert.deepEqual(reread.planningGoals.immediate, [{ text: 'Build emergency fund' }])
  assert.equal(payload.columns.client_goals, undefined)
})
test('work and beneficiary allocations cannot exceed 100 percent', () => {
  const values = profileDefaults({})
  values.personal.workAllocation = { admin: 50, manual: 51 }
  assert.throws(() => profilePayload(values), /Time spent on work activities/)
  values.personal.workAllocation.manual = 50
  values.dependantsBeneficiaries = [{ beneficiary_percentage: 75 }, { beneficiary_percentage: 26 }]
  assert.throws(() => profilePayload(values), /Beneficiary/)
  values.dependantsBeneficiaries = [{ beneficiary_percentage: 33.33 }, { beneficiary_percentage: 33.33 }, { beneficiary_percentage: 33.34 }]
  assert.doesNotThrow(() => profilePayload(values))
})

test('legacy related person details survive adding a relationship', () => {
  const values = profileDefaults({ extended_profile: { spouseOrParent: { firstName: 'Sam', marriageDate: '2000-01-01' } } })
  assert.equal(values.spouseOrParent.relationship, '')
  values.spouseOrParent.relationship = 'parent'
  const saved = profilePayload(values)
  assert.equal(saved.extra.spouseOrParent.firstName, 'Sam')
  assert.equal(saved.extra.spouseOrParent.marriageDate, '2000-01-01')
  assert.equal(saved.extra.spouseOrParent.relationship, 'parent')
  assert.deepEqual(saved.dependants, [])
})

test('required fields reject whitespace while optional fields may be empty', () => {
  assert.match(validateProfileField('   ', { label: 'First name', required: true }), /required/)
  assert.equal(validateProfileField('', { label: 'Phone', type: 'tel' }), true)
  assert.equal(validateProfileField("O’Connor", { label: 'Surname', required: true }), true)
})
test('contact, date and numeric validation reject invalid input', () => {
  const cases = [
    ['bad@', { type: 'email' }],
    ['abc1234567', { type: 'tel' }],
    ['123', { type: 'tel' }],
    ['2025-02-30', { type: 'date' }],
    ['2999-01-01', { type: 'date' }],
    ['-1', { type: 'number' }],
    ['Infinity', { type: 'number' }],
    ['101', { type: 'number', path: 'personal.workAllocation.admin' }],
    ['101', { type: 'number', path: 'dependantsBeneficiaries.0.beneficiary_percentage' }],
  ]
  for (const [value, field] of cases) assert.equal(typeof validateProfileField(value, { path: 'example', label: 'Example', ...field }), 'string')
  for (const [value, type] of [['person@example.com', 'email'], ['+27 (82) 123-4567', 'tel'], ['2024-02-29', 'date'], ['0', 'number'], ['33.33', 'number']]) {
    assert.equal(validateProfileField(value, { path: 'example', label: 'Example', type }), true)
  }
})
