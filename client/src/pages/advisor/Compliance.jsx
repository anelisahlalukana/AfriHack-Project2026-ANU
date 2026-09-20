import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ShieldEllipsis } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useTableState } from '../../hooks/useTableState'
import { getComplianceSummary } from '../../api/compliance'
import { ComplianceTracker } from '../../components/documents/ComplianceTracker'
import ClientComplianceTable from '../../components/compliance/ClientComplianceTable'

const TABS = [
  { key: 'clients', label: 'Client compliance' },
  { key: 'compliance', label: 'Compliance' },
]

export default function Compliance() {
  const { session } = useAuth()
  const [params, setParams] = useSearchParams()
  const [state, setState] = useState({ data: null, error: '' })
  const [revision, setRevision] = useState(0)
  // Tab 1's table state. Tab 2's lives in CpdBlock, under its own 'cpd' prefix.
  const [clientTable, onClientTableChange] = useTableState('', { sort: 'name', dir: 'asc', size: '10', page: '1' })

  const tab = TABS.some(entry => entry.key === params.get('tab')) ? params.get('tab') : TABS[0].key

  function selectTab(key) {
    const next = new URLSearchParams(params)
    if (key === TABS[0].key) next.delete('tab')
    else next.set('tab', key)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    let active = true
    getComplianceSummary().then(data => { if (active) setState({ data, error: '' }) })
      .catch(error => { if (active) setState({ data: null, error: error.message }) })
    return () => { active = false }
  }, [revision])

  return <>
    <header className="page-heading">
      <div>
        <p className="eyebrow">COMPLIANCE</p>
        <h1><ShieldEllipsis size={28} /> Compliance overview</h1>
        <p>Client controls and adviser development. Recorded events are on the audit log.</p>
      </div>
      <button onClick={() => setRevision(n => n + 1)}>Refresh</button>
    </header>

    <div className="rs-tabs" role="tablist" aria-label="Compliance views">
      {TABS.map(entry => <button
        key={entry.key}
        type="button"
        role="tab"
        id={`compliance-tab-${entry.key}`}
        aria-selected={tab === entry.key}
        aria-controls={`compliance-panel-${entry.key}`}
        className="rs-tab"
        onClick={() => selectTab(entry.key)}
      >{entry.label}</button>)}
    </div>

    {tab === 'clients'
      ? <section className="card" role="tabpanel" id="compliance-panel-clients" aria-labelledby="compliance-tab-clients">
        <header className="section-heading"><div><h2>Client compliance</h2><p>Consent, screenings and documents for every client assigned to you.</p></div></header>
        {state.error
          ? <p className="error" role="alert">{state.error} Use Refresh to try again.</p>
          : !state.data
            ? <p role="status">Loading client compliance…</p>
            : <ClientComplianceTable rows={state.data.clients} state={clientTable} onChange={onClientTableChange} />}
      </section>
      : <div role="tabpanel" id="compliance-panel-compliance" aria-labelledby="compliance-tab-compliance">
        <ComplianceTracker adviserId={session.user.id} onChanged={() => setRevision(n => n + 1)} />
      </div>}
  </>
}
