import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Users, X } from 'lucide-react'
import { COLUMNS, DEFAULT_VISIBLE, NOT_ASSESSED, PAGE_SIZES, RISK_CATEGORIES, STATUSES, columnByKey, displayValue, filterClients, fullName, paginate, sortClients } from '../../lib/clientTable'

// Search, filters, sort and page live in the URL (?q=&status=&risk=&sort=&dir=&size=&page=),
// so opening a client and coming back lands on the same view. Which columns are shown is a
// personal preference, kept in this browser only.
const STORAGE_KEY = 'advisor.clientTable.columns'
const URL_DEFAULTS = { sort: 'name', dir: 'asc', size: String(PAGE_SIZES[0]), page: '1' }

function loadVisibleColumns() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
    const valid = Array.isArray(saved) ? saved.filter(key => columnByKey(key)) : []
    if (valid.length) return valid.includes('name') ? valid : ['name', ...valid]
  } catch { /* storage unavailable or unreadable: use the defaults */ }
  return DEFAULT_VISIBLE
}

function saveVisibleColumns(keys) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys)) } catch { /* not saving is fine */ }
}

const label = value => String(value).replaceAll('_', ' ')

function ColumnMenu({ visible, onToggle, onReset }) {
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
    <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(value => !value)}><Columns3 size={16} /> Columns</button>
    {open && <div className="col-panel" role="group" aria-label="Choose columns">
      {COLUMNS.map(column => <label className="checkbox" key={column.key}>
        <input type="checkbox" checked={visible.includes(column.key)} disabled={column.locked} onChange={() => onToggle(column.key)} /> {column.label}
      </label>)}
      <button type="button" onClick={onReset}>Reset to default</button>
    </div>}
  </div>
}

export function ClientsTable({ clients, onAdd }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [visible, setVisible] = useState(loadVisibleColumns)

  const query = params.get('q') ?? ''
  const status = STATUSES.includes(params.get('status')) ? params.get('status') : ''
  const riskParam = params.get('risk')
  const risk = RISK_CATEGORIES.includes(riskParam) || riskParam === NOT_ASSESSED ? riskParam : ''
  const sortKey = columnByKey(params.get('sort')) ? params.get('sort') : URL_DEFAULTS.sort
  const direction = params.get('dir') === 'desc' ? 'desc' : 'asc'
  const pageSize = PAGE_SIZES.includes(Number(params.get('size'))) ? Number(params.get('size')) : PAGE_SIZES[0]

  // Changing `changes` in the URL; empty values and defaults are dropped to keep the URL short.
  function update(changes) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value == null || String(value) === URL_DEFAULTS[key]) next.delete(key)
      else next.set(key, String(value))
    }
    setParams(next, { replace: true })
  }

  function toggleColumn(key) {
    const hiding = visible.includes(key)
    const next = hiding ? visible.filter(existing => existing !== key) : [...visible, key]
    setVisible(next)
    saveVisibleColumns(next)
    if (hiding && key === sortKey) update({ sort: '', dir: '' })
  }

  function resetColumns() {
    setVisible(DEFAULT_VISIBLE)
    saveVisibleColumns(DEFAULT_VISIBLE)
  }

  function toggleSort(key) {
    update({ sort: key, dir: key === sortKey && direction === 'asc' ? 'desc' : 'asc', page: '' })
  }

  const columns = COLUMNS.filter(column => visible.includes(column.key))
  const filtered = filterClients(clients, { query, status, risk })
  const view = paginate(sortClients(filtered, sortKey, direction), Number(params.get('page')), pageSize)
  const filtersActive = Boolean(query || status || risk)
  const from = `${location.pathname}${location.search}`

  function open(client) {
    navigate(`/clients/${client.id}`, { state: { from } })
  }

  if (!clients.length) {
    return <section className="card"><div className="empty"><Users size={36} /><h3>Your first client starts here</h3><p>Create a client profile to capture their needs, finances, and goals.</p><button type="button" className="primary" onClick={onAdd}>Add a client</button></div></section>
  }

  return <section className="card">
    <div className="table-toolbar">
      <label className="search">Search<input type="search" value={query} onChange={event => update({ q: event.target.value, page: '' })} placeholder="Name, ID, email or mobile…" /></label>
      <label>Status<select value={status} onChange={event => update({ status: event.target.value, page: '' })}>
        <option value="">All statuses</option>
        {STATUSES.map(value => <option key={value} value={value}>{label(value)}</option>)}
      </select></label>
      <label>Risk profile<select value={risk} onChange={event => update({ risk: event.target.value, page: '' })}>
        <option value="">All risk profiles</option>
        {RISK_CATEGORIES.map(value => <option key={value} value={value}>{label(value)}</option>)}
        <option value={NOT_ASSESSED}>Not assessed</option>
      </select></label>
      <ColumnMenu visible={visible} onToggle={toggleColumn} onReset={resetColumns} />
      {filtersActive && <button type="button" onClick={() => update({ q: '', status: '', risk: '', page: '' })}><X size={14} /> Clear filters</button>}
    </div>

    {!view.total
      ? <p className="empty">No clients match your filters.</p>
      : <div className="table-scroll"><table className="client-table">
        <thead><tr>{columns.map(column => {
          const sorted = sortKey === column.key
          return <th key={column.key} className={column.type === 'number' ? 'num' : undefined} aria-sort={sorted ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button type="button" className={`sort-btn${sorted ? ' sorted' : ''}`} onClick={() => toggleSort(column.key)}>
              {column.label}
              {sorted ? (direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={14} />}
            </button>
          </th>
        })}</tr></thead>
        <tbody>{view.items.map(client => <tr key={client.id} className="clickable-row" onClick={event => { if (!event.target.closest('a')) open(client) }}>
          {columns.map(column => <td key={column.key} className={column.type === 'number' ? 'num' : undefined}>
            {column.key === 'name'
              ? <Link className="client-name" to={`/clients/${client.id}`} state={{ from }}>{fullName(client)}</Link>
              : column.key === 'status' && client.status
                ? <span className="badge">{label(client.status)}</span>
                : displayValue(column, client)}
          </td>)}
        </tr>)}</tbody>
      </table></div>}

    <footer className="pager">
      <span role="status">{view.total ? `Showing ${view.start}–${view.end} of ${view.total}` : 'Showing 0 clients'}{filtersActive ? ` (filtered from ${clients.length})` : ''}</span>
      <div className="pager-controls">
        <label className="checkbox">Rows per page
          <select value={pageSize} onChange={event => update({ size: event.target.value, page: '' })}>
            {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <button type="button" aria-label="Previous page" disabled={view.page <= 1} onClick={() => update({ page: view.page - 1 })}><ChevronLeft size={16} /></button>
        <span>Page {view.page} of {view.pageCount}</span>
        <button type="button" aria-label="Next page" disabled={view.page >= view.pageCount} onClick={() => update({ page: view.page + 1 })}><ChevronRight size={16} /></button>
      </div>
    </footer>
  </section>
}
