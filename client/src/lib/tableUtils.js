// Paging and sorting shared by every table in the app. Pure functions, no React,
// so each table module can build on them and be tested on its own.

// `page` is clamped into range, so a stale page number (e.g. after filtering) never
// shows an empty table.
export function paginate(items, page, pageSize) {
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount)
  const startIndex = (current - 1) * pageSize
  return {
    items: items.slice(startIndex, startIndex + pageSize),
    page: current,
    pageCount,
    total,
    start: total ? startIndex + 1 : 0,
    end: Math.min(startIndex + pageSize, total),
  }
}

const isEmpty = value => value === null || value === undefined || value === ''

function compare(type, a, b) {
  if (type === 'number') return a - b
  if (type === 'date') return Date.parse(a) - Date.parse(b)
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true })
}

// Sorts by a column definition ({ type, get }). Empty values always sort last,
// whichever direction is chosen, and `tiebreak` keeps the order stable when two rows
// compare equal.
export function sortRows(rows, column, direction = 'asc', tiebreak = () => 0) {
  const factor = direction === 'desc' ? -1 : 1
  return [...rows].sort((left, right) => {
    const a = column.get(left)
    const b = column.get(right)
    if (isEmpty(a) && !isEmpty(b)) return 1
    if (!isEmpty(a) && isEmpty(b)) return -1
    const result = isEmpty(a) && isEmpty(b) ? 0 : compare(column.type, a, b) * factor
    return result || tiebreak(left, right)
  })
}
