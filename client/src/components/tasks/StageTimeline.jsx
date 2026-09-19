import { Check } from 'lucide-react'
import { actorName, formatDateTime } from '../../lib/taskFormat'

const ACTOR_HINT = { client: 'You', adviser: 'Royal Square', provider: 'Insurer or provider' }

// The workflow's steps with done / current / upcoming state, and when each step was reached.
export function StageTimeline({ task, viewer = 'client' }) {
  const currentIndex = task.stages.findIndex(stage => stage.key === task.currentStage?.key)
  const finished = task.status === 'completed'
  const reached = {}
  for (const update of task.updates) {
    if (update.update_kind === 'stage_change' && update.stage) reached[update.stage] = update
  }

  return <ol className="rs-steps">
    {task.stages.map((stage, index) => {
      const state = finished || index < currentIndex ? 'done' : index === currentIndex && task.status !== 'declined' ? 'current' : 'upcoming'
      const update = reached[stage.key]
      const whose = viewer === 'staff' ? { ...ACTOR_HINT, client: 'Client' }[stage.actor] : ACTOR_HINT[stage.actor]
      return <li key={stage.key} className={state} aria-current={state === 'current' ? 'step' : undefined}>
        <span className="rs-dot">{state === 'done' ? <Check size={12} /> : index + 1}</span>
        <div>
          <span className="rs-step-label">{stage.label}</span>
          <small>{update ? `${actorName(update)} · ${formatDateTime(update.created_at)}` : whose}{stage.repeatable ? ' · repeats until done' : ''}</small>
        </div>
      </li>
    })}
    {task.status === 'declined' && <li className="current"><span className="rs-dot">!</span><div><span className="rs-step-label">Declined</span><small>This {task.isClaim ? 'claim' : 'request'} was declined.</small></div></li>}
  </ol>
}

// Every update in order, with who sent it and when. Internal notes are marked for staff.
export function UpdateFeed({ updates, stages = [], viewer = 'client' }) {
  const labels = Object.fromEntries(stages.map(stage => [stage.key, stage.label]))
  if (!updates.length) return <p className="rs-note">No updates yet.</p>
  return <ul className="rs-feed">
    {[...updates].reverse().map(update => <li key={update.id} className={`${!update.visible_to_client ? 'internal' : ''} ${update.actor_type === 'provider' ? 'provider' : ''}`}>
      <div className="rs-who">
        <span><b>{viewer === 'client' && update.actor_type === 'client' ? 'You' : actorName(update)}</b>{!update.visible_to_client && ' · Internal note, not shown to the client'}</span>
        <span>{formatDateTime(update.created_at)}</span>
      </div>
      {update.note ? <p>{update.note}</p> : update.update_kind === 'stage_change' && update.stage && <p>Moved to: {labels[update.stage] || (update.stage === 'declined' ? 'Declined' : update.stage)}</p>}
    </li>)}
  </ul>
}
