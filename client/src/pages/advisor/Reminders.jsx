import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CalendarClock, Check, Plus } from 'lucide-react'
import { completeReminder, listNotifications, listReminderClients, listReminderRules, listReminders, markNotificationRead } from '../../api/reminders'
import { PushControl } from '../../components/reminders/PushControl'
import { AddReminderDialog } from '../../components/reminders/AddReminderDialog'
import { STATE_LABELS, VIEWS, audienceLabel, countByView, dateLabel, filterReminders, recurrenceLabel, relativeDue, reminderState, sortReminders, stateBadgeClass, todayKey } from '../../lib/reminderTable'

const PAGE_SIZE = 25
const NOTIFICATION_LIMIT = 5

// Every reminder for the practice's clients, the notifications they have triggered, and the
// controls to add a reminder, mark one done, and turn on push alerts for this device.
export default function Reminders() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [view, setView] = useState('open')
  const [clientId, setClientId] = useState('')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let active = true
    Promise.all([listReminders(), listReminderClients(), listReminderRules(), listNotifications()])
      .then(([reminders, clients, rules, notifications]) => { if (active) { setData({ reminders, clients, rules, notifications }); setError('') } })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [reloadKey])

  const reload = () => setReloadKey(value => value + 1)

  async function markDone(reminder) {
    setBusyId(reminder.id)
    setActionError('')
    try {
      await completeReminder(reminder.id)
      reload()
    } catch (error) {
      setActionError(error.message)
    } finally {
      setBusyId(null)
    }
  }

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

  if (error) return <div className="card" role="alert"><p className="error">{error}</p><button onClick={reload}>Try again</button></div>
  if (!data) return <p role="status">Loading reminders…</p>

  const today = todayKey()
  const nameOf = id => data.clients.find(client => client.id === id)?.name || 'Unknown client'
  const counts = countByView(data.reminders, today)
  const unread = data.notifications.filter(notification => !notification.readAt)
  const matching = sortReminders(filterReminders(data.reminders, { view, clientId, query }, today, nameOf), today)
  const rows = matching.slice(0, shown)
  const filtersActive = Boolean(clientId || query)
  const latest = [...unread, ...data.notifications.filter(notification => notification.readAt)].slice(0, NOTIFICATION_LIMIT)

  function changeFilter(setter) {
    return value => { setter(value); setShown(PAGE_SIZE) }
  }

  return <>
    <header className="page-heading">
      <div>
        <h1>Reminders</h1>
        <p>Every reminder for your clients, and the notifications they trigger.</p>
      </div>
      <button type="button" className="primary" onClick={() => setAdding(true)}><Plus size={17} /> Add reminder</button>
    </header>

    {notice && <div className="auth-notice" role="status" style={{ marginBottom: 16 }}>{notice}</div>}
    {actionError && <p className="error card" role="alert" style={{ marginBottom: 16 }}>{actionError}</p>}

    <PushControl />

    <section className="card" style={{ marginTop: 20 }}>
      <header className="section-heading"><div><h2><Bell size={20} /> Notifications</h2><p>{unread.length ? `${unread.length} unread` : "You're all caught up."}</p></div></header>
      {!latest.length && <p className="empty">No notifications yet. They appear here when a reminder comes due.</p>}
      {latest.map(notification => <div className="detail-row" key={notification.id}>
        <span>
          <b style={{ fontWeight: notification.readAt ? 500 : 700 }}>{notification.title}</b>
          <small>{notification.body}</small>
          <small>{new Date(notification.createdAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}</small>
        </span>
        {notification.readAt
          ? <span className="badge">Read</span>
          : <button type="button" onClick={() => markRead(notification)} disabled={busyId === notification.id}><Check size={16} /> Mark read</button>}
      </div>)}
    </section>

    <section className="card" style={{ marginTop: 20 }}>
      <div className="chip-row" role="group" aria-label="Show reminders">
        {VIEWS.map(item => <button key={item.key} type="button" className={view === item.key ? 'primary' : ''} aria-pressed={view === item.key} onClick={() => changeFilter(setView)(item.key)}>
          {item.label} ({counts[item.key]})
        </button>)}
      </div>
      <div className="table-toolbar">
        <label className="search">Search<input type="search" value={query} onChange={event => changeFilter(setQuery)(event.target.value)} placeholder="Client or reminder…" /></label>
        <label>Client<select value={clientId} onChange={event => changeFilter(setClientId)(event.target.value)}>
          <option value="">All clients</option>
          {data.clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select></label>
        {filtersActive && <button type="button" onClick={() => { setClientId(''); setQuery(''); setShown(PAGE_SIZE) }}>Clear filters</button>}
      </div>

      {!data.reminders.length
        ? <div className="empty"><CalendarClock size={36} /><h3>No reminders yet</h3><p>Schedule a reminder for a client, such as an insurance valuation or an annual review.</p><button type="button" className="primary" onClick={() => setAdding(true)}>Add a reminder</button></div>
        : !matching.length
          ? <p className="empty">No reminders match{filtersActive ? ' your filters' : ' this view'}.</p>
          : <div className="table-scroll"><table className="client-table">
            <thead><tr><th>Client</th><th>Reminder</th><th>Due</th><th>Repeats</th><th>Notifies</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map(reminder => {
              const state = reminderState(reminder, today)
              return <tr key={reminder.id}>
                <td><Link className="client-name" to={`/clients/${reminder.clientId}`} state={{ from: '/reminders' }}>{nameOf(reminder.clientId)}</Link></td>
                <td>{reminder.title}</td>
                <td>{dateLabel(reminder.dueDate)}<small>{relativeDue(reminder.dueDate, today)}</small></td>
                <td>{recurrenceLabel(reminder.repeatMonths)}</td>
                <td>{audienceLabel(reminder.audience)}</td>
                <td><span className={stateBadgeClass(state)}>{STATE_LABELS[state]}</span></td>
                <td>{state !== 'completed' && <button type="button" onClick={() => markDone(reminder)} disabled={busyId === reminder.id}><Check size={16} /> {busyId === reminder.id ? 'Saving…' : 'Mark done'}</button>}</td>
              </tr>
            })}</tbody>
          </table></div>}

      {matching.length > 0 && <footer className="pager">
        <span role="status">Showing {rows.length} of {matching.length}</span>
        {matching.length > rows.length && <button type="button" onClick={() => setShown(count => count + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, matching.length - rows.length)} more</button>}
      </footer>}
    </section>

    {adding && <AddReminderDialog clients={data.clients} rules={data.rules} onClose={() => setAdding(false)}
      onAdded={reminder => { setAdding(false); setNotice(`Reminder added: ${reminder.title} for ${nameOf(reminder.clientId)}, due ${dateLabel(reminder.dueDate)}.`); setView('open'); reload() }} />}
  </>
}
