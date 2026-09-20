import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Bell, FileText, MessageCircle, ShieldAlert } from 'lucide-react'
import { listDocuments } from '../../api/documents'
import { listNotifications, listReminders } from '../../api/reminders'
import { filterReminders, todayKey } from '../../lib/reminderTable'

export default function ClientHome() {
  const { user, client, clientError, openAsk } = useOutletContext()
  // Documents sent to the client that they haven't signed yet. undefined while loading.
  const [waiting, setWaiting] = useState(undefined)
  const [documentsError, setDocumentsError] = useState('')
  // Reminders coming up and unread notifications. Stays null if they can't be loaded: it's only a summary.
  const [summary, setSummary] = useState(null)
  const name = client?.first_name || user.user_metadata?.full_name

  useEffect(() => {
    if (!client) return
    let active = true
    listDocuments(client.id)
      .then(documents => { if (active) { setWaiting(documents.filter(doc => doc.status === 'sent').length); setDocumentsError('') } })
      .catch(error => { if (active) setDocumentsError(error.message) })
    return () => { active = false }
  }, [client])

  useEffect(() => {
    if (!client) return
    let active = true
    Promise.all([listReminders(), listNotifications()])
      .then(([reminders, notifications]) => {
        if (active) setSummary({ comingUp: filterReminders(reminders, { view: 'open' }, todayKey()).length, unread: notifications.filter(notification => !notification.readAt).length })
      })
      .catch(() => { if (active) setSummary(null) })
    return () => { active = false }
  }, [client])

  return <>
    <header>
      <h1>Welcome{name ? `, ${name}` : ''}</h1>
    </header>

    {clientError && <p className="error card" role="alert">{clientError}</p>}
    {documentsError && <p className="error card" role="alert">{documentsError}</p>}

    <section className="card">
      {client === undefined && <p role="status">Loading…</p>}
      {client === null && !clientError && <p>Your client account is ready. Contact your adviser to arrange your financial needs analysis.</p>}
      {client && waiting === undefined && !documentsError && <p role="status">Checking your documents…</p>}
      {client && waiting > 0 && <>
        <h2><FileText size={20} /> {waiting === 1 ? '1 document is' : `${waiting} documents are`} waiting for you</h2>
        <p>Your adviser has sent you documents to review. Please complete them.</p>
        <Link className="button primary" to="/account/documents">Review documents</Link>
      </>}
      {client && waiting === 0 && <>
        <h2>You're all caught up</h2>
        <p>You have no documents waiting. Contact your adviser to arrange your financial needs analysis.</p>
        <Link className="button" to="/account/documents">View your documents</Link>
      </>}
    </section>

    {client && <section className="card">
      <h2><ShieldAlert size={20} /> Claims and requests</h2>
      <p>Log a claim and track everything in one place, or use the chat button to ask for something like a change of address.</p>
      <div className="rs-portal-links">
        <Link className="button primary" to="/account/claims">My claims and requests</Link>
        <button type="button" onClick={openAsk}><MessageCircle size={16} /> Ask for something</button>
      </div>
    </section>}

    {client && summary && <section className="card">
      <h2><Bell size={20} /> Reminders</h2>
      <p>{summary.comingUp ? `${summary.comingUp} coming up` : 'Nothing coming up right now.'}{summary.unread ? ` · ${summary.unread} unread notification${summary.unread === 1 ? '' : 's'}` : ''}</p>
      <Link className={summary.unread ? 'button primary' : 'button'} to="/account/reminders">View reminders</Link>
    </section>}
  </>
}
