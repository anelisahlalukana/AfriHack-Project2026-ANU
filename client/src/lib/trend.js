// Turns "claims and requests over time" report results into the rows for the dashboard trend chart.
// Pure, so it can be tested without a browser or a server.

const pad = number => String(number).padStart(2, '0')
const ymd = (year, month0, day) => `${year}-${pad(month0 + 1)}-${pad(day)}`
const daysIn = (year, month0) => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()

// A month as { year, month0 }, moved by a whole number of months (year wrap included).
function shift({ year, month0 }, months) {
  const total = year * 12 + month0 + months
  return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 }
}

// The last `months` completed months, and the same number of months straight before them. The
// current month is left out on purpose: half a month would always look like a drop.
export function monthRanges(months, today = new Date()) {
  const thisMonth = { year: today.getFullYear(), month0: today.getMonth() }
  const range = (first, last) => ({ from: ymd(first.year, first.month0, 1), to: ymd(last.year, last.month0, daysIn(last.year, last.month0)) })
  return {
    current: range(shift(thisMonth, -months), shift(thisMonth, -1)),
    previous: range(shift(thisMonth, -2 * months), shift(thisMonth, -months - 1)),
  }
}

// Every series in a report row added up: all the claims and requests that month, whatever their type.
const rowTotal = (row, series) => series.reduce((sum, { key }) => sum + (Number(row[key]) || 0), 0)

// One row per month of the current period, with the matching month of the previous period beside it.
// Months line up by position; a previous period that comes back shorter simply has no dashed point.
export function mergeTrend(current, previous) {
  const before = (previous?.rows || []).map(row => rowTotal(row, previous.series || []))
  return (current?.rows || []).map((row, index) => ({
    label: row.label,
    value: rowTotal(row, current.series || []),
    previous: index < before.length ? before[index] : undefined,
  }))
}

export const hasTrend = rows => rows.some(row => row.value > 0 || row.previous > 0)

// "Mar", with the year added on the first month and every January so a long range stays readable.
export function monthLabel(key, index = 1) {
  const [year, month] = key.split('-').map(Number)
  const name = new Date(Date.UTC(year, month - 1, 1, 12)).toLocaleDateString('en-ZA', { month: 'short', timeZone: 'UTC' })
  return index === 0 || month === 1 ? `${name} ’${String(year).slice(2)}` : name
}

// "March 2026", for the hover card.
export function monthName(key) {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1, 12)).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// Round whole-number ticks from 0 up to the first step at or above `max` (0, 10, 20, 30, 40), so
// the scale reads like a ruler instead of stepping by 9. Never fewer than 1 per step: these are counts.
export function niceTicks(max, count = 4) {
  const top = Math.max(Number(max) || 0, 1)
  const rough = top / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = Math.max(1, [1, 2, 5, 10].map(multiple => multiple * magnitude).find(candidate => candidate >= rough))
  const ticks = []
  for (let value = 0; value < top + step; value += step) ticks.push(value)
  return ticks
}
