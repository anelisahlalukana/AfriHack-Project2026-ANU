// Which columns a table shows is a personal preference, kept in this browser only.
// Separate from the table components so a bad or stale saved list is repaired in one
// place, and so the component file exports only components.

export function loadVisibleColumns(storageKey, { columns, fallback, locked }) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey))
    const known = new Set(columns.map(column => column.key))
    const valid = Array.isArray(saved) ? saved.filter(key => known.has(key)) : []
    // A saved list that lost the locked column is repaired rather than discarded.
    if (valid.length) return locked && !valid.includes(locked) ? [locked, ...valid] : valid
  } catch { /* storage unavailable or unreadable: use the defaults */ }
  return fallback
}

export function saveVisibleColumns(storageKey, keys) {
  try { window.localStorage.setItem(storageKey, JSON.stringify(keys)) } catch { /* not saving is fine */ }
}
