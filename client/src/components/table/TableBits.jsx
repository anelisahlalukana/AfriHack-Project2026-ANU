import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3 } from 'lucide-react'

// The pieces every table in the app shares: a column chooser, sortable headers and a
// pager. Each table keeps its own columns and data; only the chrome lives here.

export function ColumnMenu({ columns, visible, onToggle, onReset }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = event => { if (!menuRef.current?.contains(event.target)) setOpen(false) }
    const closeOnEscape = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return <div className="col-menu" ref={menuRef}>
    <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(value => !value)}>
      <Columns3 size={16} /> Columns
    </button>
    {open && <div className="col-panel" role="group" aria-label="Choose columns">
      {columns.map(column => <label className="checkbox" key={column.key}>
        <input type="checkbox" checked={visible.includes(column.key)} disabled={column.locked} onChange={() => onToggle(column.key)} />
        {' '}{column.label}
      </label>)}
      <button type="button" onClick={onReset}>Reset to default</button>
    </div>}
  </div>
}

// One sortable header cell. `sort`/`direction` are the table's current sort.
export function SortHeader({ column, sort, direction, onSort }) {
  const sorted = sort === column.key
  return <th className={column.type === 'number' ? 'num' : undefined} aria-sort={sorted ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" className={`sort-btn${sorted ? ' sorted' : ''}`} onClick={() => onSort(column.key)}>
      {column.label}
      {sorted ? (direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={14} />}
    </button>
  </th>
}

export function Pager({ view, pageSizes, pageSize, onPageSize, onPage, label = 'rows', filtered = false, unfilteredTotal }) {
  return <footer className="pager">
    <span role="status">
      {view.total ? `Showing ${view.start}–${view.end} of ${view.total}` : `Showing 0 ${label}`}
      {filtered && unfilteredTotal !== undefined ? ` (filtered from ${unfilteredTotal})` : ''}
    </span>
    <div className="pager-controls">
      <label className="checkbox">Rows per page
        <select value={pageSize} onChange={event => onPageSize(event.target.value)}>
          {pageSizes.map(size => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <button type="button" aria-label="Previous page" disabled={view.page <= 1} onClick={() => onPage(view.page - 1)}><ChevronLeft size={16} /></button>
      <span>Page {view.page} of {view.pageCount}</span>
      <button type="button" aria-label="Next page" disabled={view.page >= view.pageCount} onClick={() => onPage(view.page + 1)}><ChevronRight size={16} /></button>
    </div>
  </footer>
}
