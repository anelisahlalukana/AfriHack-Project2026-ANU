import { useEffect, useState } from 'react'
import { ShieldEllipsis } from 'lucide-react'
import { getClientCompliance } from '../../api/compliance'
import { complianceBadge, complianceLabel, complianceDate } from '../../lib/complianceStatus'
import AuditTrail from './AuditTrail'

export default function ClientComplianceCard({ clientId, reloadKey = 0 }) {
  const [state, setState] = useState({ compliance: null, error: '' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    getClientCompliance(clientId).then(compliance => { if (active) setState({ compliance, error: '' }) })
      .catch(error => { if (active) setState({ compliance: null, error: error.message }) })
    return () => { active = false }
  }, [clientId, reloadKey, revision])
  const record = state.compliance
  return <section className="card">
    <header className="section-heading"><h2><ShieldEllipsis size={20} /> Client compliance</h2>
      {record && <span className={complianceBadge(record.status)}>{complianceLabel(record.status)}</span>}</header>
    <p>Live client and document records from Supabase. Only recorded, non-simulated screenings count towards compliance. No live screening provider is connected.</p>
    {state.error ? <p className="error" role="alert">{state.error} <button onClick={() => setRevision(n => n + 1)}>Retry</button></p>
      : !record ? <p role="status">Loading compliance…</p> : <>
        <div className="detail-row"><span><b>Client consent</b><small>Annual renewal policy · expiry {complianceDate(record.consent.expiresAt)}</small></span>
          <span className={complianceBadge(record.consent.state)}>{complianceLabel(record.consent.state)}</span></div>
        {[["pep", "PEP", record.pep], ["terrorism_financing", "Terrorism financing", record.terrorismFinancing]].map(([type, label, check]) =>
          <div className="detail-row" key={type}><span><b>{label}</b><small>{check.declared ? 'Declared PEP · ' : ''}{check.checkedAt ? `${check.source} · ${complianceDate(check.checkedAt)}` : 'No genuine screening recorded'}</small></span>
            <span className={complianceBadge(check.status)}>{complianceLabel(check.status)}</span></div>)}
        <p><b>Documents: {record.documents.signed}/{record.documents.total} complete</b></p>
        {record.actions.length ? <ul>{record.actions.map(action => <li key={action}>{action}</li>)}</ul> : <p>All tracked client controls are complete.</p>}
      </>}
    <AuditTrail clientId={clientId} reloadKey={`${reloadKey}:${revision}`} />
  </section>
}
