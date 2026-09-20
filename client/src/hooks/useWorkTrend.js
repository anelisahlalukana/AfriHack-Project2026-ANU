import { useEffect, useState } from 'react'
import { runReport } from '../api/reports'
import { mergeTrend, monthRanges } from '../lib/trend'

const TEMPLATE_ID = 'task_volume_trend'

// Claims and requests logged per month for the last `months` months, next to the same stretch
// before it, from the existing reports engine (so an adviser sees their own clients, as on the
// Reports page). It loads when `months` changes and does not refresh on a timer: monthly totals
// don't move fast enough to justify it. `loading` is worked out from which request the result
// belongs to, so a stale answer never shows under a newer choice.
export function useWorkTrend(months) {
  const [state, setState] = useState({ months: null, rows: null, error: '' })

  useEffect(() => {
    const controller = new AbortController()
    const { current, previous } = monthRanges(months)
    Promise.all([
      runReport(TEMPLATE_ID, { date_range: current }, controller.signal),
      runReport(TEMPLATE_ID, { date_range: previous }, controller.signal),
    ])
      .then(([now, before]) => setState({ months, rows: mergeTrend(now, before), error: '' }))
      .catch(error => { if (!error.canceled) setState({ months, rows: null, error: error.message }) })
    return () => controller.abort()
  }, [months])

  const settled = state.months === months
  return { loading: !settled, rows: settled ? state.rows : null, error: settled ? state.error : '' }
}
