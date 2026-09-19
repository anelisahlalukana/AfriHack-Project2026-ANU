import { statusLabel, statusTone, waitingLabel, progressText } from '../../lib/taskFormat'

export function StatusChip({ status, viewer = 'client' }) {
  return <span className={`rs-chip ${statusTone(status)}`}>{statusLabel(status, viewer)}</span>
}

export function WaitingChip({ task, viewer = 'staff' }) {
  if (!task.waitingOn || (task.waitingOn === 'client' && task.status === 'awaiting_client')) return null
  const tone = task.overdue ? 'red' : task.waitingOn === 'us' && viewer === 'staff' ? 'warn' : ''
  return <span className={`rs-chip ${tone}`}>{task.overdue ? 'Overdue · ' : ''}{waitingLabel(task.waitingOn, task.provider?.name, viewer)}</span>
}

export function ProgressBar({ progress }) {
  if (!progress) return null
  return <div className="rs-progress">
    <div className="rs-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label="Progress">
      <i style={{ width: `${progress.percent}%` }} />
    </div>
    <small>{progressText(progress)}</small>
  </div>
}

export function Alert({ children }) {
  if (!children) return null
  return <p className="error" role="alert">{children}</p>
}
