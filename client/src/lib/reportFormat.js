// Pure helpers for the Reports page (tested in tests/reportFormat.test.js).

const UNIT_SUFFIX = { days: ' days', hours: ' h', '%': '%', rating: ' / 5' }
const RAND = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

export function formatValue(value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value ?? '—'
  if (unit === 'rand') return RAND.format(value)
  const text = Number.isInteger(value) ? value.toLocaleString('en-ZA') : value.toLocaleString('en-ZA', { maximumFractionDigits: 1 })
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

export function featuredTemplates(templates = [], max = 9) {
  const featured = templates.filter(t => t.featured)
  return (featured.length ? featured : templates).slice(0, max)
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

export function formatGeneratedAt(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })
}

// Horizontal bars when labels are long or there are many of them, so nothing gets cut off.
export function preferHorizontalBars(rows = []) {
  return rows.length > 6 || rows.some(row => String(row.label ?? '').length > 14)
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
