import { Link, useOutletContext } from 'react-router-dom'
import {
  ArrowRight, Bell, CircleCheckBig, Clock, FilePen, FileSignature, Inbox, Lightbulb,
  MessageCircle, Plus, ShieldAlert, Target, TrendingUp, TriangleAlert, Wallet,
} from 'lucide-react'
import { useClientOverview } from '../../hooks/useClientOverview'
import { money } from '../../lib/financials'
import { plural, relativeTime, share } from '../../lib/dashboardFormat'
import { formatDate, progressText, waitingLabel } from '../../lib/taskFormat'
import { StatusChip } from '../../components/tasks/TaskBits'

const ACTION_ICONS = { document: FileSignature, consent: ShieldAlert, task: Inbox, draft: FilePen, reminder: Bell, advice: Lightbulb }
const STATUS_LABELS = { onboarding: 'Getting set up', active: 'Active client', inactive: 'Inactive' }

function greeting(now = new Date()) {
  const hour = now.getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

// One thing the client has to do, wherever it came from. The link is what finishes it.
function ActionRow({ action }) {
  const Icon = ACTION_ICONS[action.kind] || Clock
  return <li className={`cdash-action tone-${action.priority}`}>
    <span className="cdash-action-icon" aria-hidden="true"><Icon size={18} /></span>
    <span className="cdash-action-text">
      <b>{action.title}</b>
      <small>{action.detail}</small>
    </span>
    <Link className="cdash-action-go" to={action.href}>{action.actionLabel} <ArrowRight size={15} /></Link>
  </li>
}

function Stat({ icon: Icon, value, label, to, tone }) {
  return <Link className={`cdash-stat${tone ? ` tone-${tone}` : ''}`} to={to}>
    <Icon size={18} aria-hidden="true" />
    <b>{value}</b>
    <small>{label}</small>
  </Link>
}

// A labelled bar. `tone` colours money in and money out; everything else uses the default.
function Bar({ title, value, whole, display, tone }) {
  return <div className="chart-row">
    <div><span>{title}</span><b>{display ?? value}</b></div>
    <div className="track"><span style={{ width: `${share(value, whole)}%` }} className={tone ? `tone-${tone}` : ''} /></div>
  </div>
}

// The client's home screen: everything the practice knows about them that they can act on,
// kept live by useClientOverview. Their own to-do list comes first, then their claims, the
// money and goals their adviser recorded, reminders and the latest activity.
export default function ClientHome() {
  const { client, clientError, openAsk } = useOutletContext()
  const { data, error, refresh } = useClientOverview(Boolean(client))

  if (clientError) return <><header><h1>Welcome</h1></header><p className="error card" role="alert">{clientError}</p></>
  if (client === undefined) return <><header><h1>Welcome</h1></header><p role="status">Loading…</p></>
  if (client === null) return <>
    <header><h1>Welcome</h1></header>
    <p className="card">Your client account is ready. Contact your adviser to arrange your financial needs analysis.</p>
  </>

  if (!data) return <>
    <header><h1>{greeting()}{client.first_name ? `, ${client.first_name}` : ''}</h1></header>
    {error
      ? <div className="card" role="alert"><p className="error">{error}</p><button onClick={refresh}>Try again</button></div>
      : <p role="status">Loading your dashboard…</p>}
  </>

  const { actions, paperwork, work, finances, goals, reminders, activity } = data
  const updated = new Date(data.generatedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
  const scale = Math.max(finances.assets, finances.liabilities)

  return <div className="cdash">
    <header>
      <h1>{greeting()}{data.client.firstName ? `, ${data.client.firstName}` : ''}</h1>
      <p>
        <span className="rs-chip">{STATUS_LABELS[data.client.status] || data.client.status}</span>{' '}
        <span className={`live${error ? ' live-stale' : ''}`} role="status">
          <i aria-hidden="true" />{error ? 'Reconnecting, showing your last update' : 'Live'} · {updated}
        </span>
      </p>
    </header>

    <section className={`card cdash-actions${actions.urgent ? ' rs-needs' : ''}`}>
      <div className="section-heading">
        <div>
          <h2>{actions.urgent ? <TriangleAlert size={20} /> : <CircleCheckBig size={20} />} {actions.total ? 'What needs you' : "You're all caught up"}</h2>
          <p>{actions.urgent
            ? `${plural(actions.urgent, 'item')} late or waiting on you.`
            : actions.total
              ? 'Nothing is late. These are worth doing soon.'
              : 'Nothing is waiting on you right now.'}</p>
        </div>
      </div>

      {actions.total > 0
        ? <ul className="cdash-action-list">{actions.list.map(action => <ActionRow key={action.id} action={action} />)}</ul>
        : <p className="empty">We'll show anything that needs your signature, your answer or your attention right here.</p>}

      {actions.total > actions.list.length && <small>Showing the {actions.list.length} most pressing of {actions.total}.</small>}

      <div className="rs-portal-links">
        <Link className="button primary" to="/account/claims/new"><Plus size={16} /> Log a claim</Link>
        <button type="button" onClick={openAsk}><MessageCircle size={16} /> Ask for something</button>
      </div>
    </section>

    <div className="cdash-stats">
      <Stat icon={Inbox} value={work.open} label={work.open === 1 ? 'open claim or request' : 'open claims and requests'} to="/account/claims" tone={work.awaitingYou ? 'urgent' : ''} />
      <Stat icon={FileSignature} value={`${paperwork.signed}/${paperwork.total}`} label="documents signed" to="/account/documents" tone={paperwork.awaitingYou ? 'urgent' : ''} />
      <Stat icon={Bell} value={reminders.overdue + reminders.dueSoon} label={`due in the next ${reminders.dueSoonDays} days`} to="/account/reminders" tone={reminders.overdue ? 'urgent' : ''} />
    </div>

    {!paperwork.complete && <section className="card">
      <div className="section-heading">
        <div><h2><FileSignature size={20} /> Your paperwork</h2><p>Your adviser can only act for you once all {paperwork.total} are signed.</p></div>
        <Link to="/account/documents">Open</Link>
      </div>
      <Bar title={`${paperwork.signed} of ${paperwork.total} signed`} value={paperwork.signed} whole={paperwork.total} display={`${paperwork.percent}%`} />
      <ul className="cdash-steps">{paperwork.steps.map(step => <li key={step.documentType} className={step.status}>
        <span>{['signed', 'filed'].includes(step.status) ? <CircleCheckBig size={15} /> : <Clock size={15} />} {step.label}</span>
        <small>{{ signed: 'Signed', filed: 'Signed', sent: 'Waiting for you', not_sent: 'Not sent yet' }[step.status]}</small>
      </li>)}</ul>
    </section>}

    <section className="card">
      <div className="section-heading">
        <div><h2><ShieldAlert size={20} /> Claims and requests</h2><p>{work.open
          ? `${work.awaitingYou} waiting on you · ${work.withAdviser} with your adviser${work.withProvider ? ` · ${work.withProvider} with your provider` : ''}`
          : work.settled ? `Nothing open. ${plural(work.settled, 'claim', 'claims')} settled so far.` : 'Nothing open at the moment.'}</p></div>
        <Link to="/account/claims">View all</Link>
      </div>
      {!work.list.length
        ? <p className="empty">Log a claim or ask for something and you'll be able to follow every step here.</p>
        : work.list.map(task => <div className="cdash-task" key={task.id}>
          <div className="section-heading">
            <div><Link className="client-name" to={`/account/tasks/${task.id}`}>{task.title}</Link><small>{task.reference}{task.provider ? ` · ${task.provider}` : ''}</small></div>
            <StatusChip status={task.status} />
          </div>
          <div className="rs-progress">
            <div className="rs-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={task.progress?.percent ?? 0} aria-label={`${task.title} progress`}>
              <i style={{ width: `${task.progress?.percent ?? 0}%` }} />
            </div>
            <small>{task.stage || 'Submitted'}{task.progress ? ` · ${progressText(task.progress)}` : ''} · {waitingLabel(task.waitingOn, task.provider, 'client')}</small>
          </div>
        </div>)}
      {work.drafts > 0 && <small>{plural(work.drafts, 'claim')} you started but haven't sent.</small>}
    </section>

    {finances.recorded && <section className="card">
      <div className="section-heading">
        <div><h2><Wallet size={20} /> Your money</h2><p>What your adviser has on record. Tell them if anything has changed.</p></div>
      </div>
      <p className="cdash-figure">{money(finances.netWorth)}</p>
      <small>Your net worth</small>
      <Bar title="What you own" value={finances.assets} whole={scale} display={money(finances.assets)} tone="positive" />
      <Bar title="What you owe" value={finances.liabilities} whole={scale} display={money(finances.liabilities)} tone="negative" />
      {finances.topAssets.map(item => <div className="detail-row" key={`a-${item.label}`}><span>{item.label}</span><b>{money(item.amount)}</b></div>)}
      {finances.topLiabilities.map(item => <div className="detail-row" key={`l-${item.label}`}><span>{item.label}</span><b className="cdash-owed">−{money(item.amount)}</b></div>)}
    </section>}

    {goals.total > 0 && <section className="card">
      <div className="section-heading">
        <div><h2><Target size={20} /> Your goals</h2><p>{goals.offTrack
          ? `${plural(goals.offTrack, 'goal')} past the date you set.`
          : `${plural(goals.inProgress, 'goal')} in progress${goals.achieved ? ` · ${goals.achieved} reached` : ''}.`}</p></div>
      </div>
      {goals.fundedPercent !== null && <Bar title="Funded so far, across every goal" value={goals.totalProgress} whole={goals.totalTarget} display={`${goals.fundedPercent}%`} />}
      {goals.list.map(goal => <div className="goal" key={goal.id}>
        <div className="section-heading">
          <div><b>{goal.name}</b>{goal.targetDate && <small> · target {formatDate(goal.targetDate)}</small>}</div>
          {goal.offTrack && <span className="rs-chip red">Past its date</span>}
        </div>
        {goal.targetAmount
          ? <Bar title={`${money(goal.currentProgress)} of ${money(goal.targetAmount)}`} value={goal.currentProgress} whole={goal.targetAmount} display={`${goal.percent}%`} />
          : <p className="muted">No target amount set yet.</p>}
      </div>)}
    </section>}

    {reminders.list.length > 0 && <section className="card">
      <div className="section-heading">
        <div><h2><Bell size={20} /> Coming up</h2><p>{reminders.overdue ? `${plural(reminders.overdue, 'reminder')} overdue.` : 'Nothing overdue.'}</p></div>
        <Link to="/account/reminders">All reminders</Link>
      </div>
      {reminders.list.map(reminder => <div className="detail-row" key={reminder.id}>
        <span>{reminder.title}<small>{formatDate(reminder.dueDate)}</small></span>
        <span className={`rs-chip${reminder.daysUntil < 0 ? ' red' : ''}`}>
          {reminder.daysUntil < 0 ? `${plural(-reminder.daysUntil, 'day')} late` : reminder.daysUntil === 0 ? 'Today' : `In ${plural(reminder.daysUntil, 'day')}`}
        </span>
      </div>)}
    </section>}

    <section className="card">
      <div className="section-heading">
        <div><h2><TrendingUp size={20} /> Latest activity</h2><p>{activity.unread ? `${plural(activity.unread, 'update')} you haven't read.` : 'Nothing new since you last looked.'}</p></div>
        <Link to="/account/reminders">All updates</Link>
      </div>
      {!activity.recent.length
        ? <p className="empty">Every document, claim update and message will show up here.</p>
        : activity.recent.map(item => <Link className="detail-row cdash-activity" key={item.id} to={item.href}>
          <span><b style={{ fontWeight: item.read ? 500 : 700 }}>{item.title}</b>{item.body && <small>{item.body}</small>}</span>
          <small>{relativeTime(item.createdAt)}</small>
        </Link>)}
    </section>
  </div>
}
