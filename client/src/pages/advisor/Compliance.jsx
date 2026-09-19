import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldEllipsis } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { getComplianceSummary } from '../../api/compliance'
import { complianceBadge, complianceLabel, filterCompliance } from '../../lib/complianceStatus'
import { ComplianceTracker } from '../../components/documents/ComplianceTracker'
import AuditTrail from '../../components/compliance/AuditTrail'

const TILES = [['clients', 'Clients'], ['compliant', 'Compliant'], ['actionRequired', 'Action required'],
  ['consentExpiring', 'Consent expiring soon'], ['screeningsFlagged', 'Clients with flagged screenings'], ['documentsOutstanding', 'Clients with documents outstanding']]
export default function Compliance() {
  const { session } = useAuth()
  const [state, setState] = useState({ data: null, error: '' })
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  useEffect(() => {
    let active = true
    getComplianceSummary().then(data => { if (active) setState({ data, error: '' }) })
      .catch(error => { if (active) setState({ data: null, error: error.message }) })
    return () => { active = false }
  }, [revision])
  const rows = filterCompliance(state.data?.clients || [], search, filter)
  return <>
    <header className="page-heading"><div><p className="eyebrow">COMPLIANCE</p><h1><ShieldEllipsis size={28} /> Compliance overview</h1>
      <p>Client controls, adviser development and a record of changes.</p></div><button onClick={() => setRevision(n => n + 1)}>Refresh</button></header>
    <p className="auth-notice">Prototype tracking: screenings are mocked, CPD is self-recorded, and consent uses an annual renewal policy. Status covers these controls only.</p>
    {state.error ? <p className="error" role="alert">{state.error} Use Refresh to try again.</p> : !state.data ? <p role="status">Loading compliance overview…</p> : <>
      <div className="stats compliance-stats">{TILES.map(([key, label]) => <article className="card" key={key}><span>{label}</span><strong>{state.data.summary[key]}</strong></article>)}</div>
      <section className="card"><header className="section-heading"><h2>Client compliance</h2><span>{rows.length} clients shown</span></header>
        <label>Search clients<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Client name" /></label>
        <div className="compliance-actions" aria-label="Filter by compliance status">{['all', 'action_required', 'attention', 'compliant'].map(value =>
          <button key={value} aria-pressed={filter === value} className={filter === value ? 'primary' : ''} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : complianceLabel(value)}</button>)}</div>
        {!rows.length ? <p className="empty">No clients match this view.</p> : <div className="compliance-table"><table>
          <thead><tr>{['Client', 'Status', 'Consent', 'PEP (mock)', 'Terrorism financing (mock)', 'Documents'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.clientId}><td><Link to={`/clients/${row.clientId}`}>{row.name}</Link></td>
            {[row.status, row.consent.state, row.pep.status, row.terrorismFinancing.status].map((status, index) => <td key={index}><span className={complianceBadge(status)}>{complianceLabel(status)}</span></td>)}
            <td>{row.documents.signed}/{row.documents.total}</td></tr>)}</tbody>
        </table></div>}
      </section>
    </>}
    <ComplianceTracker adviserId={session.user.id} onChanged={() => setRevision(n => n + 1)} />
    <section className="card"><AuditTrail reloadKey={revision} /></section>
  </>
}
