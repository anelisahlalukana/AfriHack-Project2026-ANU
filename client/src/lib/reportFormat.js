// Pure helpers for the Reports page (tested in tests/reportFormat.test.js).

const UNIT_SUFFIX = { days: ' days', hours: ' h', '%': '%', rating: ' / 5', years: ' yrs' }
const RAND = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

export function formatValue(value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value ?? '—'
  if (unit === 'rand') return RAND.format(value)
  // Decimal point (not the en-ZA comma) so charts match the written summary.
  const text = (Number.isInteger(value) ? value.toLocaleString('en-ZA') : value.toLocaleString('en-ZA', { maximumFractionDigits: 1 })).replace(',', '.')
  return `${text}${UNIT_SUFFIX[unit] || ''}`
}

// Short axis labels: R2.5m, R250k, 40%.
export function formatAxisValue(value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value
  if (unit === 'rand') {
    const abs = Math.abs(value)
    if (abs >= 1e6) return `R${+(value / 1e6).toFixed(1)}m`
    if (abs >= 1e3) return `R${Math.round(value / 1e3)}k`
    return `R${value}`
  }
  if (unit === '%') return `${value}%`
  return value.toLocaleString('en-ZA')
}

// Featured templates first (the chips), then the rest; grouped for "Browse all reports".
export function groupTemplates(templates = [], categories = []) {
  const order = [...categories, ...templates.map(t => t.category).filter(c => c && !categories.includes(c))]
  return [...new Set(order)]
    .map(category => ({ category, templates: templates.filter(t => t.category === category) }))
    .filter(group => group.templates.length)
}

// The few questions shown as chips: one each for claims, money, stuck work and compliance.
// Everything else is one click away under "Browse all reports".
export const SUGGESTED_IDS = ['claims_by_type', 'claim_value_trend', 'stuck_tasks', 'document_completion']
const SHORT_QUESTIONS = {
  claims_by_type: 'Which claims do we get most?',
  claim_value_trend: 'How much is claimed and paid out?',
  stuck_tasks: 'What work is stuck?',
  document_completion: 'Who is missing documents?',
}

// Chip text: short enough for the four chips to sit on one line.
export function chipText(template) {
  return SHORT_QUESTIONS[template.id] || template.suggestedQuestion || template.label
}

export function featuredTemplates(templates = [], max = 4) {
  const picked = SUGGESTED_IDS.map(id => templates.find(t => t.id === id)).filter(Boolean)
  const featured = templates.filter(t => t.featured && !picked.includes(t))
  const rest = templates.filter(t => !picked.includes(t) && !featured.includes(t))
  return [...picked, ...featured, ...rest].slice(0, max)
}

// "Showing: Claims by status, 21 Jun 2026 – 19 Sep 2026"
export function showingLabel(result) {
  if (!result?.template) return ''
  if (result.kind === 'query') return `Showing: ${result.template.label}`
  return `Showing: ${result.template.label}${result.scope ? `, ${result.scope}` : ''}`
}

// Free-form examples that go through the question box (they show off custom queries).
export const TRY_ASKING = [
  'How many motor claims were declined this year?',
  'Average client rating per provider',
  'Which claims have been idle for more than 14 days?',
  'Total assets per adviser',
  'List clients who are onboarding',
]

export function isClosestMatch(result) {
  return result?.matchedBy === 'keyword'
}

// The report's story arrives as paragraphs separated by blank lines.
export function storyParagraphs(text) {
  return String(text || '').split(/\n\s*\n/).map(part => part.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

export function formatGeneratedAt(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })
}

// Horizontal bars when labels are long or there are many of them, so nothing gets cut off.
// Compact charts (related views, half width) switch sooner.
export function preferHorizontalBars(rows = [], compact = false) {
  const [most, longest] = compact ? [4, 9] : [6, 14]
  return rows.length > most || rows.some(row => String(row.label ?? '').length > longest)
}

// Donut slices with their share of the whole, for the legend.
export function withShares(rows = []) {
  const total = rows.reduce((sum, row) => sum + (Number(row.value) || 0), 0)
  return rows.map(row => ({ ...row, share: total ? Math.round(((Number(row.value) || 0) / total) * 100) : 0 }))
}

export function hasData(result) {
  if (!result?.rows?.length) return false
  if (result.chartType === 'table' || result.chartType === 'stat') return true
  const keys = (result.series || []).map(s => s.key)
  return result.rows.some(row => keys.some(key => Number(row[key]) > 0))
}

// Weekly keys are Mondays (2026-09-14), monthly keys are 2026-09.
export function periodLabel(key) {
  if (/^\d{4}-\d{2}$/.test(key)) return new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-ZA', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return key
}

// A file-name-friendly title for the printed PDF.
export function printTitle(title) {
  return `Royal Square - ${String(title || 'Report').replace(/[\\/:*?"<>|]+/g, '').slice(0, 80)}`
}
