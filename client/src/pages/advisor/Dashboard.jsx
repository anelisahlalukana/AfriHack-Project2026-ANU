import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ArrowUpRight, Users, Wallet, Target } from 'lucide-react'
import { useClients } from '../../hooks/useClients'
import { money, totals } from '../../lib/financials'
export default function Dashboard() {
  const { data, loading, error, retry } = useClients()
  const [query, setQuery] = useState('')
  if (loading) return <p role="status">Loading clients…</p>
  if (error) return <div className="card" role="alert"><p className="error">{error}</p><button onClick={retry}>Try again</button></div>
  const clients = data || []
  const filtered = clients.filter(client => `${client.first_name} ${client.surname} ${client.contact_email || ''}`.toLowerCase().includes(query.toLowerCase()))
  return <><header className="page-heading"><div><p className="eyebrow">THE BIG PICTURE</p><h1>Your clients, at a glance</h1><p>Meaningful progress starts with understanding the whole picture.</p></div><Link className="button primary" to="/clients/new"><Plus size={17} /> Add client</Link></header>
    <div className="stats"><article className="card"><Users /><span>Total clients</span><strong>{clients.length}</strong></article><article className="card"><Wallet /><span>Combined net worth</span><strong>{money(clients.reduce((sum, client) => sum + totals(client.client_financial_items).netWorth, 0))}</strong></article><article className="card"><Target /><span>Goals in progress</span><strong>{clients.reduce((sum, client) => sum + client.client_goals.filter(goal => goal.status === 'in_progress').length, 0)}</strong></article></div>
    <section className="card"><header className="section-heading"><div><h2>Client directory</h2><p>A personal view of every financial journey.</p></div><label className="search">Search clients<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name or email…" /></label></header>
      {!clients.length ? <div className="empty"><Users size={36} /><h3>Your first client starts here</h3><p>Create a client profile to capture their needs, finances, and goals.</p><Link className="button primary" to="/clients/new">Onboard a client</Link></div> : !filtered.length ? <p className="empty">No clients match your search.</p> : <div className="table-scroll"><table><thead><tr><th>Client</th><th>Status</th><th>Net worth</th><th>Goals</th><th><span className="sr-only">Open profile</span></th></tr></thead><tbody>{filtered.map(client => <tr key={client.id}><td><Link className="client-name" to={`/clients/${client.id}`}>{client.first_name} {client.surname}</Link><small>{client.contact_email || 'No email provided'}</small></td><td><span className="badge">{client.status}</span></td><td>{money(totals(client.client_financial_items).netWorth)}</td><td>{client.client_goals.length}</td><td><Link to={`/clients/${client.id}`} aria-label={`View ${client.first_name} ${client.surname}`}><ArrowUpRight size={20} /></Link></td></tr>)}</tbody></table></div>}
    </section></>
}
