import { useEffect, useState } from 'react'
import { getComplianceAudit } from '../../api/compliance'
import { complianceDate, complianceLabel } from '../../lib/complianceStatus'

export default function AuditTrail({ clientId, reloadKey = 0 }) {
  const [state, setState] = useState({ entries: null, error: '' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    getComplianceAudit(clientId)
      .then(entries => { if (active) setState({ entries, error: '' }) })
      .catch(error => { if (active) setState({ entries: null, error: error.message }) })
    return () => { active = false }
  }, [clientId, reloadKey, retry])
  return <section className="compliance-audit" aria-label="Compliance audit trail">
    <h3>Recent audit trail</h3>
    <p className="muted">Latest 50 events · South African dates</p>
    {state.error ? <p className="error" role="alert">{state.error} <button onClick={() => setRetry(n => n + 1)}>Retry</button></p>
      : state.entries === null ? <p role="status">Loading audit trail…</p>
        : !state.entries.length ? <p className="empty">No compliance events recorded yet.</p>
          : <ol>{state.entries.map(entry => <li key={entry.id}>
            <time dateTime={entry.createdAt}>{complianceDate(entry.createdAt)}</time> — {entry.summary} — Result: {complianceLabel(entry.result)} — by {entry.actorName}
          </li>)}</ol>}
  </section>
}
