import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatValue, showingLabel, isClosestMatch, preferHorizontalBars, withShares, hasData, periodLabel, printTitle } from '../src/lib/reportFormat.js'

test('formatValue adds units and keeps one decimal', () => {
  assert.equal(formatValue(4.56, 'days'), '4.6 days')
  assert.equal(formatValue(12, 'hours'), '12 h')
  assert.equal(formatValue(3, 'claims'), '3')
  assert.equal(formatValue(undefined), '—')
})

test('showingLabel and the closest-match note', () => {
  assert.equal(showingLabel({ template: { label: 'Claims by status' }, scope: 'last 90 days' }), 'Showing: Claims by status, last 90 days')
  assert.equal(isClosestMatch({ matchedBy: 'keyword' }), true)
  assert.equal(isClosestMatch({ matchedBy: 'ai' }), false)
})

test('long or many labels switch to horizontal bars', () => {
  assert.equal(preferHorizontalBars([{ label: 'Open' }]), false)
  assert.equal(preferHorizontalBars([{ label: 'Old Mutual Insure Mock' }]), true)
})

test('withShares and hasData', () => {
  assert.deepEqual(withShares([{ label: 'a', value: 1 }, { label: 'b', value: 3 }]).map(r => r.share), [25, 75])
  assert.equal(hasData({ chartType: 'bar', rows: [{ label: 'a', value: 0 }], series: [{ key: 'value' }] }), false)
  assert.equal(hasData({ chartType: 'bar', rows: [{ label: 'a', value: 2 }], series: [{ key: 'value' }] }), true)
  assert.equal(hasData({ chartType: 'table', rows: [{ client: 'x' }] }), true)
})

test('period labels and print titles', () => {
  assert.match(periodLabel('2026-09'), /^Sep\w* 26$/)
  assert.match(periodLabel('2026-09-14'), /14/)
  assert.equal(printTitle('Claims: by/status'), 'Royal Square - Claims bystatus')
})

test('money, percentages and ratings', async () => {
  const { formatValue, formatAxisValue } = await import('../src/lib/reportFormat.js')
  assert.match(formatValue(2500000, 'rand'), /^R\s?2.500.000$/)
  assert.equal(formatAxisValue(2500000, 'rand'), 'R2.5m')
  assert.equal(formatAxisValue(250000, 'rand'), 'R250k')
  assert.equal(formatValue(40, '%'), '40%')
  assert.equal(formatValue(4, 'rating'), '4 / 5')
})

test('grouping and featured templates', async () => {
  const { groupTemplates, featuredTemplates } = await import('../src/lib/reportFormat.js')
  const t = [{ id: 'a', category: 'Clients' }, { id: 'b', category: 'Claims', featured: true }, { id: 'c', category: 'Claims' }]
  assert.deepEqual(groupTemplates(t, ['Claims', 'Clients']).map(g => [g.category, g.templates.length]), [['Claims', 2], ['Clients', 1]])
  assert.deepEqual(featuredTemplates(t).map(x => x.id), ['b'])
  assert.deepEqual(featuredTemplates([{ id: 'x' }]).map(x => x.id), ['x'])
})

test('query results are labelled by their title and stats count as data', async () => {
  const { showingLabel, hasData, TRY_ASKING } = await import('../src/lib/reportFormat.js')
  assert.equal(showingLabel({ kind: 'query', template: { label: 'Declined motor claims' }, scope: 'all records' }), 'Showing: Declined motor claims')
  assert.equal(hasData({ chartType: 'stat', rows: [{ label: 'Number of claims', value: 0 }] }), true)
  assert.ok(TRY_ASKING.length >= 3)
})

test('the report story splits into paragraphs on blank lines', async () => {
  const { storyParagraphs, formatValue } = await import('../src/lib/reportFormat.js')
  assert.deepEqual(storyParagraphs('First part.\nstill first.\n\n  Second part. '), ['First part. still first.', 'Second part.'])
  assert.deepEqual(storyParagraphs(''), [])
  assert.deepEqual(storyParagraphs(null), [])
  assert.equal(formatValue(12, 'years'), '12 yrs')
  assert.equal(formatValue(12.5, 'days'), '12.5 days')
})

test('compact charts switch to horizontal bars sooner', () => {
  const rows = ['Life', 'Commercial', 'Motor', 'Funeral', 'Personal'].map(label => ({ label }))
  assert.equal(preferHorizontalBars(rows), false)
  assert.equal(preferHorizontalBars(rows, true), true)
  assert.equal(preferHorizontalBars(rows.slice(0, 3).map(() => ({ label: 'Motor' })), true), false)
})
