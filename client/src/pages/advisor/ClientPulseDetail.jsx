import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlarmClock, ArrowLeft, CalendarClock, FileSignature, Inbox, Send, Target } from 'lucide-react'
import { sendCheckIn } from '../../api/dashboard'
import { useClientPulse } from '../../hooks/useAtRiskClients'
import { goalProgress } from '../../lib/financials'
import { riskBadge, signalDetails } from '../../lib/clientPulse'
import { plural } from '../../lib/dashboardFormat'

const SIGNAL_ICON = { document: FileSignature, reminder: CalendarClock, task: Inbox, goal: Target, onboarding: AlarmClock }

// One signal in the timeline, with the data behind it. Links go to where the adviser can deal with it.
function Signal({ signal, clientId }) {
  const Icon = SIGNAL_ICON[signal.kind]
  const details = signalDetails(signal)
  return <div className="detail-row">
    <span>
      <b><Icon size={16} style={{ verticalAlign: '-3px' }} /> {signal.reason}</b>
      {details.map((line, index) => <small key={index}>{line}</small>)}
      {signal.kind === 'goal' && signal.targetAmount > 0 && <progress max="100" value={goalProgress({ target_amount: signal.targetAmount, current_progress: signal.currentProgress })} aria-label={`${signal.goalName} progress`} />}
      {signal.kind === 'task' && <Link to={`/tasks/${signal.taskId}`}>Open request</Link>}
      {['document', 'onboarding'].includes(signal.kind) && <Link to={`/clients/${clientId}`} state={{ from: `/client-pulse/${clientId}` }}>Open documents</Link>}
      {signal.kind === 'reminder' && <Link to="/reminders">Open reminders</Link>}
    </span>
    {signal.days !== null && <span className="signal-days">{plural(signal.days, 'day')}</span>}
  </div>
}

// Everything behind one client's risk score, and the check-in action.
export default function ClientPulseDetail() {
  const { clientId } = useParams()
  const { data, error, refresh } = useClientPulse(clientId)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(null)
  const [sendError, setSendError] = useState('')

  async function checkIn() {
    setSending(true); setSendError(''); setSent(null)
    try {
      setSent(await sendCheckIn(clientId))
      refresh()
    } catch (error) { setSendError(error.message) }
    finally { setSending(false) }
  }

  const back = <Link className="back" to="/client-pulse"><ArrowLeft size={16} /> All at-risk clients</Link>
  if (!data) return error
    ? <>{back}<div className="card" role="alert"><p className="error">{error}</p><button onClick={refresh}>Try again</button></div></>
    : <p role="status">Loading client…</p>

  const badge = riskBadge(data.level)
  const updated = new Date(data.generatedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return <>
    {back}
    <header className="page-heading">
      <div>
        <p className="eyebrow">CLIENT PULSE</p>
        <h1>{data.client.name}</h1>
        <p><span className="badge">{data.client.status}</span> <span className={badge.className}>{badge.phrase} · score {data.score}</span>{' '}
          <span className={`live${error ? ' live-stale' : ''}`} role="status"><i aria-hidden="true" />{error ? 'Reconnecting, showing the last update' : 'Live'} · updated {updated}</span>
        </p>
      </div>
      <button className="primary" onClick={checkIn} disabled={sending}><Send size={16} /> {sending ? 'Sending…' : 'Send a check-in'}</button>
    </header>

    {sent && <p className="auth-notice" role="status" style={{ marginBottom: 20 }}>
      <b>Check-in sent to {sent.clientName}.</b> They will see this in their notifications: “{sent.body}”
    </p>}
    {sendError && <p className="error" role="alert" style={{ marginBottom: 20 }}>{sendError}</p>}

    <section className="card">
      <header className="section-heading">
        <div><h2>What's going stale</h2><p>Oldest first. Each one adds to the score.</p></div>
        <Link to={`/clients/${clientId}`} state={{ from: `/client-pulse/${clientId}` }}>Open client profile</Link>
      </header>
      {!data.signals.length
        ? <p className="empty">Nothing is flagged for this client right now.</p>
        : data.signals.map((signal, index) => <Signal key={`${index}-${signal.kind}`} signal={signal} clientId={clientId} />)}
    </section>
  </>
}
