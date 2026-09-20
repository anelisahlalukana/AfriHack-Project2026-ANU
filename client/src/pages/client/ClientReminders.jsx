import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Bell, CalendarClock, Check } from 'lucide-react'
import { listNotifications, listReminders, markNotificationRead } from '../../api/reminders'
import { PushControl } from '../../components/reminders/PushControl'
import { STATE_LABELS, dateLabel, filterReminders, recurrenceLabel, relativeDue, reminderState, sortReminders, stateBadgeClass, todayKey } from '../../lib/reminderTable'

const NOTIFICATION_LIMIT = 5
const EARLIER_LIMIT = 10

// What Royal Square has scheduled for the client, the notifications those reminders sent, and the
// switch for push alerts on this device. Read-only: reminders are managed by the client's adviser,
// and the server only ever returns this client's own.
export default function ClientReminders() {
  const { client, clientError } = useOutletContext()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!client) return
    let active = true
    Promise.all([listReminders(), listNotifications()])
      .then(([reminders, notifications]) => { if (active) { setData({ reminders, notifications }); setError('') } })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [client, reloadKey])

  async function markRead(notification) {
    setBusyId(notification.id)
    setActionError('')
    try {
      await markNotificationRead(notification.id)
      setData(current => ({ ...current, notifications: current.notifications.map(item => (item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item)) }))
    } catch (error) {
      setActionError(error.message)
    } finally {
      setBusyId(null)
    }
  }

  const today = todayKey()
  const comingUp = data ? sortReminders(filterReminders(data.reminders, { view: 'open' }, today), today) : []
  const earlier = data ? filterReminders(data.reminders, { view: 'done' }, today).sort((a, b) => b.dueDate.localeCompare(a.dueDate)).slice(0, EARLIER_LIMIT) : []
  const unread = data ? data.notifications.filter(notification => !notification.readAt) : []
  const latest = data ? [...unread, ...data.notifications.filter(notification => notification.readAt)].slice(0, NOTIFICATION_LIMIT) : []

  const reminderRow = reminder => {
    const state = reminderState(reminder, today)
    return <div className="detail-row" key={reminder.id}>
      <span>
        <b>{reminder.title}</b>
        <small>{dateLabel(reminder.dueDate)} · {relativeDue(reminder.dueDate, today)}</small>
        <small>{recurrenceLabel(reminder.repeatMonths)}</small>
      </span>
      <span className={stateBadgeClass(state)} style={{ alignSelf: 'flex-start' }}>{STATE_LABELS[state]}</span>
    </div>
  }

  return <>
    <header>
      <h1>Reminders</h1>
    </header>

    {clientError && <p className="error card" role="alert">{clientError}</p>}
    {client === undefined && <p role="status">Loading…</p>}
    {client === null && !clientError && <p className="card">Your client account is ready. Contact your adviser to set up your reminders.</p>}
    {error && <div className="card" role="alert"><p className="error">{error}</p><button type="button" onClick={() => setReloadKey(value => value + 1)}>Try again</button></div>}
    {actionError && <p className="error card" role="alert">{actionError}</p>}
    {client && !data && !error && <p role="status">Loading your reminders…</p>}

    {data && <>
      <section className="card">
        <header className="section-heading"><div><h2><Bell size={20} /> Notifications</h2><p>{unread.length ? `${unread.length} unread` : "You're all caught up."}</p></div></header>
        {!latest.length && <p className="empty">Nothing yet. Alerts appear here when a reminder is due.</p>}
        {latest.map(notification => <div className="detail-row" key={notification.id}>
          <span>
            <b style={{ fontWeight: notification.readAt ? 500 : 700 }}>{notification.title}</b>
            <small>{notification.body}</small>
            <small>{new Date(notification.createdAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}</small>
          </span>
          {notification.readAt
            ? <span className="badge" style={{ alignSelf: 'flex-start' }}>Read</span>
            : <button type="button" onClick={() => markRead(notification)} disabled={busyId === notification.id} style={{ whiteSpace: 'nowrap', flexShrink: 0, alignSelf: 'flex-start' }}><Check size={16} /> Mark read</button>}
        </div>)}
      </section>

      <section className="card">
        <header className="section-heading"><div><h2><CalendarClock size={20} /> Coming up</h2><p>Reminders your adviser has set for you.</p></div></header>
        {!comingUp.length && <p className="empty">You have no upcoming reminders.</p>}
        {comingUp.map(reminderRow)}
      </section>

      {earlier.length > 0 && <section className="card">
        <header className="section-heading"><div><h2>Earlier</h2><p>Reminders that have already been sent or completed.</p></div></header>
        {earlier.map(reminderRow)}
      </section>}
    </>}

    {client && <PushControl unavailableMessage="Push alerts aren't available right now. Your reminders will still appear on this page." />}
  </>
}
