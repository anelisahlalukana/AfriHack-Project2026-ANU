import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { useClients } from '../../hooks/useClients'
import { ClientsTable } from '../../components/clients/ClientsTable'
import { AddClientDialog } from '../../components/clients/AddClientDialog'

// Every client in one sortable, filterable table. Opening a row goes to that client's
// financial overview (ClientProfile). "Add client" opens a popup; it's driven by
// ?add=1 in the URL so other pages can link straight to it.
export default function Clients() {
  const { data, loading, error, retry } = useClients()
  const [params, setParams] = useSearchParams()
  const [added, setAdded] = useState(null)
  const adding = params.get('add') === '1'

  function setAdding(open) {
    const next = new URLSearchParams(params)
    if (open) next.set('add', '1')
    else next.delete('add')
    setParams(next, { replace: true })
  }

  function handleAdded(client) {
    setAdded(client)
    setAdding(false)
    retry()
  }

  const clients = data || []

  return <>
    <header className="page-heading">
      <div>
        <p className="eyebrow">YOUR CLIENTS</p>
        <h1>Clients</h1>
        {data && <p>{clients.length} {clients.length === 1 ? 'client' : 'clients'}. Open a client to see their financial overview.</p>}
      </div>
      <button type="button" className="primary" onClick={() => setAdding(true)}><Plus size={17} /> Add client</button>
    </header>

    {added && <div className="auth-notice" role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span>Added {added.first_name} {added.surname}. An invitation has been emailed to {added.contact_email}. <Link to={`/clients/${added.id}`} state={{ from: '/clients' }}>Open their overview</Link></span>
      <button type="button" aria-label="Dismiss" onClick={() => setAdded(null)} style={{ padding: 4 }}><X size={16} /></button>
    </div>}

    {loading && <p role="status">Loading clients…</p>}
    {error && <div className="card" role="alert"><p className="error">{error}</p><button onClick={retry}>Try again</button></div>}
    {data && <ClientsTable clients={clients} onAdd={() => setAdding(true)} />}

    {adding && <AddClientDialog onClose={() => setAdding(false)} onAdded={handleAdded} />}
  </>
}
