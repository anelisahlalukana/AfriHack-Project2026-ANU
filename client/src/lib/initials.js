// First letters of a name, for the round avatar in the sidebar identity chip.
export function initialsOf(name) {
  return (name || '')
    .split(/[\s@._-]+/).filter(Boolean).slice(0, 2)
    .map(part => part[0].toUpperCase()).join('') || '·'
}
