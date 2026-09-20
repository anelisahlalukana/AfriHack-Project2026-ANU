import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Download, ScrollText, X } from 'lucide-react'
import { getAuditFacets, getAuditLog, getAuditLogForExport } from '../api/auditLog'
import { useAuth } from '../hooks/useAuth'
import { isAdmin, isProvider } from '../lib/authRoles'
import {
  ACTOR_LABELS, AVAILABLE_COLUMNS, COLUMNS, PAGE_SIZES, SOURCE_LABELS,
  columnByKey, columnsFor, defaultVisibleFor, displayValue, exportFileName, exportTable, humanise,
} from '../lib/auditTable'
import { downloadTable } from '../lib/exportTable'

// Search, filters, sort and page live in the URL, so a log view can be linked to or
// returned to. Which columns are shown is a personal preference for this browser only.
const URL_DEFAULTS = { sort: 'occurredAt', dir: 'desc', size: String(PAGE_SIZES[0]), page: '1' }

const storageKey = role => `audit.columns.${role}`

function loadVisibleColumns(role) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(role)))
    const allowed = AVAILABLE_COLUMNS[role] || []
    const valid = Array.isArray(saved) ? saved.filter(key => columnByKey(key) && allowed.includes(key)) : []
    // 'occurredAt' is locked on, so a saved list that lost it is repaired rather than discarded.
    if (valid.length) return valid.includes('occurredAt') ? valid : ['occurredAt', ...valid]
  } catch { /* storage unavailable or unreadable: use the defaults */ }
  return defaultVisibleFor(role)
}

function saveVisibleColumns(role, keys) {
  try { window.localStorage.setItem(storageKey(role), JSON.stringify(keys)) } catch { /* not saving is fine */ }
}

function ColumnMenu({ role, visible, onToggle, onReset }) {
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

  const allowed = AVAILABLE_COLUMNS[role] || []
  return <div className="col-menu" ref={menuRef}>
    <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(value => !value)}><Columns3 size={16} /> Columns</button>
    {open && <div className="col-panel" role="group" aria-label="Choose columns">
      {COLUMNS.filter(column => allowed.includes(column.key)).map(column => <label className="checkbox" key={column.key}>
        <input type="checkbox" checked={visible.includes(column.key)} disabled={column.locked} onChange={() => onToggle(column.key)} /> {column.label}
      </label>)}
      <button type="button" onClick={onReset}>Reset to default</button>
    </div>}
  </div>
}

// The audit log for whoever is signed in. Admins see everything, advisors see their
// own actions and anything that happened on their clients, and providers see only
// their own correspondence — all decided by the API, not here.
export default function AuditLog() {
  const { user } = useAuth()
  const role = isAdmin(user) ? 'admin' : isProvider(user) ? 'provider' : 'advisor'

  const [params, setParams] = useSearchParams()
  const [visible, setVisible] = useState(() => loadVisibleColumns(role))
  const [state, setState] = useState({ data: null, error: '' })
  const [facets, setFacets] = useState({ sources: [], categories: [], actorTypes: [] })
  const [downloading, setDownloading] = useState('')
  const [downloadError, setDownloadError] = useState('')

  const search = params.get('q') ?? ''
  const source = params.get('source') ?? ''
  const category = params.get('category') ?? ''
  const actorType = params.get('actorType') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const sort = columnByKey(params.get('sort')) ? params.get('sort') : URL_DEFAULTS.sort
  const dir = params.get('dir') === 'asc' ? 'asc' : 'desc'
  const size = PAGE_SIZES.includes(Number(params.get('size'))) ? Number(params.get('size')) : PAGE_SIZES[0]
  const page = Math.max(1, Number(params.get('page')) || 1)

  // A date input gives a plain day; the API wants instants, so widen `to` to the
  // end of that day or a same-day filter would return nothing.
  const query = {
    q: search, source, category, actorType,
    from: from ? new Date(`${from}T00:00:00`).toISOString() : '',
    to: to ? new Date(`${to}T23:59:59.999`).toISOString() : '',
    sort, dir, size, page,
  }
  const queryKey = JSON.stringify(query)

  function update(changes) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value == null || String(value) === URL_DEFAULTS[key]) next.delete(key)
      else next.set(key, String(value))
    }
    setParams(next, { replace: true })
  }

  useEffect(() => {
    let active = true
    getAuditLog(JSON.parse(queryKey))
      .then(data => { if (active) setState({ data, error: '' }) })
      // Keep the last good page on screen so a failed refresh never blanks the table.
      .catch(error => { if (active) setState(current => ({ ...current, error: error.message })) })
    return () => { active = false }
  }, [queryKey])

  useEffect(() => {
    let active = true
    getAuditFacets()
      .then(data => { if (active) setFacets(data) })
      .catch(() => { /* the dropdowns just stay empty; the table still works */ })
    return () => { active = false }
  }, [])

  const columns = columnsFor(role, visible)

  function toggleColumn(key) {
    const hiding = visible.includes(key)
    const next = hiding ? visible.filter(existing => existing !== key) : [...visible, key]
    setVisible(next)
    saveVisibleColumns(role, next)
    // Sorting by a column nobody can see is confusing, so fall back to the default.
    if (hiding && key === sort) update({ sort: '', dir: '' })
  }

  function resetColumns() {
    const next = defaultVisibleFor(role)
    setVisible(next)
    saveVisibleColumns(role, next)
  }

  function toggleSort(key) {
    update({ sort: key, dir: key === sort && dir === 'desc' ? 'asc' : 'desc', page: '' })
  }

  // Downloads take every row matching the current filters, not just this page, and
  // carry exactly the columns that are on screen.
  const download = useCallback(async format => {
    setDownloading(format)
    setDownloadError('')
    try {
      const all = await getAuditLogForExport(JSON.parse(queryKey))
      downloadTable(exportTable(columns, all.entries), format, exportFileName(format))
      if (all.truncated) setDownloadError(`Only the first ${all.entries.length} rows were included. Narrow the dates and download again.`)
    } catch (error) {
      setDownloadError(error.message)
    } finally {
      setDownloading('')
    }
  }, [queryKey, columns])

  const data = state.data
  const filtersActive = Boolean(search || source || category || actorType || from || to)

  const scopeNote = {
    admin: 'Every recorded event across the practice.',
    advisor: 'Your own actions and everything recorded on your clients.',
    provider: 'Every exchange between your organisation and Royal Square.',
  }[role]

  return <>
    <header className="page-heading">
      <div>
        <p className="eyebrow">AUDIT LOG</p>
        <h1>Activity</h1>
        <p>{scopeNote}</p>
      </div>
      <div className="audit-downloads">
        <button type="button" disabled={!data?.total || Boolean(downloading)} onClick={() => download('csv')}>
          <Download size={16} /> {downloading === 'csv' ? 'Preparing…' : 'CSV'}
        </button>
        <button type="button" className="primary" disabled={!data?.total || Boolean(downloading)} onClick={() => download('xlsx')}>
          <Download size={16} /> {downloading === 'xlsx' ? 'Preparing…' : 'Excel'}
        </button>
      </div>
    </header>

    {downloadError && <p className="error" role="alert">{downloadError}</p>}

    <section className="card">
      <div className="table-toolbar">
        <label className="search">Search
          <input type="search" value={search} onChange={event => update({ q: event.target.value, page: '' })} placeholder="Detail, person, client or reference…" />
        </label>
        {facets.sources.length > 1 && <label>Source
          <select value={source} onChange={event => update({ source: event.target.value, page: '' })}>
            <option value="">All sources</option>
            {facets.sources.map(value => <option key={value} value={value}>{SOURCE_LABELS[value] || humanise(value)}</option>)}
          </select>
        </label>}
        <label>Event
          <select value={category} onChange={event => update({ category: event.target.value, page: '' })}>
            <option value="">All events</option>
            {facets.categories.map(value => <option key={value} value={value}>{humanise(value)}</option>)}
          </select>
        </label>
        {facets.actorTypes.length > 1 && <label>Acting as
          <select value={actorType} onChange={event => update({ actorType: event.target.value, page: '' })}>
            <option value="">Anyone</option>
            {facets.actorTypes.map(value => <option key={value} value={value}>{ACTOR_LABELS[value] || humanise(value)}</option>)}
          </select>
        </label>}
        <label>From<input type="date" value={from} max={to || undefined} onChange={event => update({ from: event.target.value, page: '' })} /></label>
        <label>To<input type="date" value={to} min={from || undefined} onChange={event => update({ to: event.target.value, page: '' })} /></label>
        <ColumnMenu role={role} visible={visible} onToggle={toggleColumn} onReset={resetColumns} />
        {filtersActive && <button type="button" onClick={() => update({ q: '', source: '', category: '', actorType: '', from: '', to: '', page: '' })}>
          <X size={14} /> Clear filters
        </button>}
      </div>

      {state.error && <p className="error" role="alert">{state.error}</p>}

      {!data ? <p role="status">Loading the audit log…</p>
        : !data.total
          ? <div className="empty"><ScrollText size={34} /><h3>Nothing recorded yet</h3>
            <p>{filtersActive ? 'No events match these filters.' : 'Events appear here as work happens.'}</p></div>
          : <div className="table-scroll"><table className="audit-table">
            <thead><tr>{columns.map(column => {
              const sorted = sort === column.key
              return <th key={column.key} aria-sort={sorted ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className={`sort-btn${sorted ? ' sorted' : ''}`} onClick={() => toggleSort(column.key)}>
                  {column.label}
                  {sorted ? (dir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={14} />}
                </button>
              </th>
            })}</tr></thead>
            <tbody>{data.entries.map(row => <tr key={`${row.source}-${row.id}`}>
              {columns.map(column => <td key={column.key} className={column.key === 'summary' ? 'audit-detail' : undefined}>
                {column.key === 'source'
                  ? <span className={`badge audit-source-${row.source}`}>{displayValue(column, row)}</span>
                  : displayValue(column, row)}
              </td>)}
            </tr>)}</tbody>
          </table></div>}

      {Boolean(data?.total) && <footer className="pager">
        <span role="status">
          Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total}
          {filtersActive ? ' (filtered)' : ''}
        </span>
        <div className="pager-controls">
          <label className="checkbox">Rows per page
            <select value={size} onChange={event => update({ size: event.target.value, page: '' })}>
              {PAGE_SIZES.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <button type="button" aria-label="Previous page" disabled={data.page <= 1} onClick={() => update({ page: data.page - 1 })}><ChevronLeft size={16} /></button>
          <span>Page {data.page} of {data.pageCount}</span>
          <button type="button" aria-label="Next page" disabled={data.page >= data.pageCount} onClick={() => update({ page: data.page + 1 })}><ChevronRight size={16} /></button>
        </div>
      </footer>}
    </section>
  </>
}
