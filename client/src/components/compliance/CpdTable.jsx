import { useState } from 'react'
import { X } from 'lucide-react'
import { ColumnMenu, Pager, SortHeader } from '../table/TableBits'
import { loadVisibleColumns, saveVisibleColumns } from '../../lib/tableColumns'
import {
  CPD_COLUMNS, CPD_DEFAULT_VISIBLE, PAGE_SIZES,
  cpdColumnByKey, cpdDisplayValue, cpdRows, cpdTotals, filterCpd, paginate, sortCpd,
} from '../../lib/complianceTables'

const STORAGE_KEY = 'compliance.cpdTable.columns'

// One row per recorded CPD activity. Newest first by default, because that is the
// order an adviser adds them in.
export default function CpdTable({ records, cycle, state, onChange }) {
  const [visible, setVisible] = useState(() =>
    loadVisibleColumns(STORAGE_KEY, { columns: CPD_COLUMNS, fallback: CPD_DEFAULT_VISIBLE, locked: 'activity' }))

  const sort = cpdColumnByKey(state.sort) ? state.sort : 'completedOn'
  const direction = state.dir === 'asc' ? 'asc' : 'desc'
  const pageSize = PAGE_SIZES.includes(Number(state.size)) ? Number(state.size) : PAGE_SIZES[0]
  const cycleFilter = ['in', 'out'].includes(state.cycle) ? state.cycle : ''

  const columns = CPD_COLUMNS.filter(column => visible.includes(column.key))
  const all = cpdRows(records, cycle)
  const filtered = filterCpd(all, { query: state.q, cycle: cycleFilter })
  const view = paginate(sortCpd(filtered, sort, direction), Number(state.page), pageSize)
  const totals = cpdTotals(filtered)
  const filtersActive = Boolean(state.q || cycleFilter)

  function toggleColumn(key) {
    const hiding = visible.includes(key)
    const next = hiding ? visible.filter(existing => existing !== key) : [...visible, key]
    setVisible(next)
    saveVisibleColumns(STORAGE_KEY, next)
    if (hiding && key === sort) onChange({ sort: '', dir: '' })
  }

  function resetColumns() {
    setVisible(CPD_DEFAULT_VISIBLE)
    saveVisibleColumns(STORAGE_KEY, CPD_DEFAULT_VISIBLE)
  }

  return <>
    <div className="table-toolbar">
      <label className="search">Search activities
        <input type="search" value={state.q} onChange={event => onChange({ q: event.target.value, page: '' })} placeholder="Activity name…" />
      </label>
      <label>Cycle
        <select value={cycleFilter} onChange={event => onChange({ cycle: event.target.value, page: '' })}>
          <option value="">All activities</option>
          <option value="in">In current cycle</option>
          <option value="out">Outside current cycle</option>
        </select>
      </label>
      <ColumnMenu columns={CPD_COLUMNS} visible={visible} onToggle={toggleColumn} onReset={resetColumns} />
      {filtersActive && <button type="button" onClick={() => onChange({ q: '', cycle: '', page: '' })}><X size={14} /> Clear filters</button>}
    </div>

    {!view.total
      ? <p className="empty">{records.length ? 'No activities match this view.' : 'No CPD activities recorded.'}</p>
      : <div className="table-scroll"><table className="compliance-cpd-table">
        <thead><tr>{columns.map(column =>
          <SortHeader key={column.key} column={column} sort={sort} direction={direction}
            onSort={key => onChange({ sort: key, dir: key === sort && direction === 'desc' ? 'asc' : 'desc', page: '' })} />)}
        </tr></thead>
        <tbody>{view.items.map(row => <tr key={row.id}>
          {columns.map(column => <td key={column.key} className={column.type === 'number' ? 'num' : undefined}>
            {column.key === 'cycle'
              ? <span className={row.withinCycle ? 'badge status-signed' : 'badge'}>{row.withinCycle ? 'In cycle' : 'Outside cycle'}</span>
              : cpdDisplayValue(column, row)}
          </td>)}
        </tr>)}</tbody>
        {/* The footer totals what is on screen, so a filtered view reports its own hours. */}
        <tfoot><tr>
          <td colSpan={columns.length}>{totals.count} {totals.count === 1 ? 'activity' : 'activities'} · {totals.hours} hours{filtersActive ? ' in this view' : ''}</td>
        </tr></tfoot>
      </table></div>}

    <Pager
      view={view} pageSizes={PAGE_SIZES} pageSize={pageSize} label="activities"
      filtered={filtersActive} unfilteredTotal={all.length}
      onPageSize={size => onChange({ size, page: '' })}
      onPage={page => onChange({ page })}
    />
  </>
}
