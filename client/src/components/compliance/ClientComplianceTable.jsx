import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { ColumnMenu, Pager, SortHeader } from '../table/TableBits'
import { loadVisibleColumns, saveVisibleColumns } from '../../lib/tableColumns'
import { complianceBadge, complianceLabel } from '../../lib/complianceStatus'
import {
  CLIENT_COLUMNS, CLIENT_DEFAULT_VISIBLE, CLIENT_STATUSES, PAGE_SIZES,
  clientColumnByKey, clientDisplayValue, filterClientCompliance, paginate, sortClientCompliance,
} from '../../lib/complianceTables'

const STORAGE_KEY = 'compliance.clientTable.columns'

// One row per client. Search, filter, sort and page come from the page's URL state,
// so the view survives navigating into a client and back.
export default function ClientComplianceTable({ rows, state, onChange }) {
  const [visible, setVisible] = useState(() =>
    loadVisibleColumns(STORAGE_KEY, { columns: CLIENT_COLUMNS, fallback: CLIENT_DEFAULT_VISIBLE, locked: 'name' }))

  const sort = clientColumnByKey(state.sort) ? state.sort : 'name'
  const direction = state.dir === 'desc' ? 'desc' : 'asc'
  const pageSize = PAGE_SIZES.includes(Number(state.size)) ? Number(state.size) : PAGE_SIZES[0]
  const statusFilter = CLIENT_STATUSES.includes(state.status) ? state.status : ''

  const columns = CLIENT_COLUMNS.filter(column => visible.includes(column.key))
  const filtered = filterClientCompliance(rows, { query: state.q, status: statusFilter })
  const view = paginate(sortClientCompliance(filtered, sort, direction), Number(state.page), pageSize)
  const filtersActive = Boolean(state.q || statusFilter)

  function toggleColumn(key) {
    const hiding = visible.includes(key)
    const next = hiding ? visible.filter(existing => existing !== key) : [...visible, key]
    setVisible(next)
    saveVisibleColumns(STORAGE_KEY, next)
    // Sorting by a column nobody can see is confusing, so fall back to the default.
    if (hiding && key === sort) onChange({ sort: '', dir: '' })
  }

  function resetColumns() {
    setVisible(CLIENT_DEFAULT_VISIBLE)
    saveVisibleColumns(STORAGE_KEY, CLIENT_DEFAULT_VISIBLE)
  }

  return <>
    <div className="table-toolbar">
      <label className="search">Search clients
        <input type="search" value={state.q} onChange={event => onChange({ q: event.target.value, page: '' })} placeholder="Client name…" />
      </label>
      <label>Status
        <select value={statusFilter} onChange={event => onChange({ status: event.target.value, page: '' })}>
          <option value="">All statuses</option>
          {CLIENT_STATUSES.map(value => <option key={value} value={value}>{complianceLabel(value)}</option>)}
        </select>
      </label>
      <ColumnMenu columns={CLIENT_COLUMNS} visible={visible} onToggle={toggleColumn} onReset={resetColumns} />
      {filtersActive && <button type="button" onClick={() => onChange({ q: '', status: '', page: '' })}><X size={14} /> Clear filters</button>}
    </div>

    {!view.total
      ? <p className="empty">No clients match this view.</p>
      : <div className="table-scroll"><table className="compliance-client-table">
        <thead><tr>{columns.map(column =>
          <SortHeader key={column.key} column={column} sort={sort} direction={direction}
            onSort={key => onChange({ sort: key, dir: key === sort && direction === 'asc' ? 'desc' : 'asc', page: '' })} />)}
        </tr></thead>
        <tbody>{view.items.map(row => <tr key={row.clientId}>
          {columns.map(column => <td key={column.key} className={column.type === 'number' ? 'num' : undefined}>
            {column.key === 'name'
              ? <Link className="client-name" to={`/clients/${row.clientId}`}>{row.name}</Link>
              : column.kind === 'status'
                ? <span className={complianceBadge(column.get(row))}>{complianceLabel(column.get(row))}</span>
                : clientDisplayValue(column, row)}
          </td>)}
        </tr>)}</tbody>
      </table></div>}

    <Pager
      view={view} pageSizes={PAGE_SIZES} pageSize={pageSize} label="clients"
      filtered={filtersActive} unfilteredTotal={rows.length}
      onPageSize={size => onChange({ size, page: '' })}
      onPage={page => onChange({ page })}
    />
  </>
}
