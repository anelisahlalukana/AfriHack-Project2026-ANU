import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAtRiskClients } from '../../hooks/useAtRiskClients'
import { rankingNote, riskBadge } from '../../lib/clientPulse'

// Which clients are most at risk of disengaging, and why, kept live by useAtRiskClients. Each row
// opens that client's drill-down, where the adviser can act on it.
export default function ClientPulse() {
  const { data, error, refresh } = useAtRiskClients()
  const navigate = useNavigate()

  if (!data) return error
    ? <div className="card" role="alert"><p className="error">{error}</p><button onClick={refresh}>Try again</button></div>
    : <p role="status">Loading Client Pulse…</p>

  const updated = new Date(data.generatedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const note = rankingNote(data)

  return <>
    <header className="page-heading">
      <div>
        <h1>Client Pulse</h1>
        <p>Clients most at risk of disengaging, and why.{' '}
          <span className={`live${error ? ' live-stale' : ''}`} role="status"><i aria-hidden="true" />{error ? 'Reconnecting, showing the last update' : 'Live'} · updated {updated}</span>
        </p>
      </div>
    </header>

    <section className="card">
      {!data.clients.length
        ? <p className="empty">No clients need attention right now. Everyone is on track.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th>Client</th><th>Risk</th><th>Why they were flagged</th><th><span className="sr-only">Open</span></th></tr></thead>
          <tbody>{data.clients.map(client => {
            const badge = riskBadge(client.level)
            return <tr key={client.id} className="pulse-row" onClick={() => navigate(`/client-pulse/${client.id}`)}>
              <td><Link className="client-name" to={`/client-pulse/${client.id}`} onClick={event => event.stopPropagation()}>{client.name}</Link></td>
              <td><span className={badge.className}>{badge.label}</span><small>Score {client.score}</small></td>
              {/* Only the heaviest reason: the server sorts them by weight. The rest are
                  on the client's own page, under "What's going stale". */}
              <td className="pulse-reason">{client.reasons[0] || '—'}
                {client.reasons.length > 1 && <small>+{client.reasons.length - 1} more</small>}
              </td>
              <td aria-hidden="true"><ChevronRight size={18} /></td>
            </tr>
          })}</tbody>
        </table></div>}
      {note && <small>{note}</small>}
      <small>High risk is a score above {data.scale.highAbove}; medium is above {data.scale.mediumAbove}.</small>
    </section>
  </>
}
