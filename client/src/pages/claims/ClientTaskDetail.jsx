import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useTask } from '../../hooks/useTasks'
import { ProgressBar, StatusChip, WaitingChip } from '../../components/tasks/TaskBits'
import { StageTimeline, UpdateFeed } from '../../components/tasks/StageTimeline'
import { ClientActionPanel } from '../../components/tasks/ClientActionPanel'
import { DocumentsPanel } from '../../components/tasks/DocumentsPanel'
import { MessageBox } from '../../components/tasks/MessageBox'
import { SubmittedDetails } from '../../components/tasks/SubmittedDetails'

export default function ClientTaskDetail() {
  const { taskId } = useParams()
  const { data: task, loading, error, retry, replace } = useTask(taskId)
  if (loading) return <p role="status">Loading…</p>
  if (error) return <div className="card" role="alert"><p className="error">{error}</p><button onClick={retry}>Try again</button><Link to="/account/claims">Back</Link></div>
  if (task.status === 'draft') return <Navigate to={`/account/claims/${task.id}/continue`} replace />

  return <>
    <Link className="back" to="/account/claims"><ArrowLeft size={16} /> My claims & requests</Link>
    <header className="page-heading">
      <div>
        <h1>{task.isClaim ? `${task.typeLabel} claim` : task.typeLabel}</h1>
        <p>{task.reference}{task.providerReference ? ` · ${task.provider?.name} ${task.providerReference}` : ''}</p>
        <p className="rs-chips"><StatusChip status={task.status} /><WaitingChip task={task} viewer="client" />{task.claimsHandler && <span className="rs-chip">Handler: {task.claimsHandler}</span>}</p>
      </div>
    </header>
    <div className="rs-stack">
      <ClientActionPanel task={task} onChange={replace} />
      <div className="rs-detail">
        <div className="rs-stack">
          <section className="card"><h2>Progress</h2><ProgressBar progress={task.progress} /><StageTimeline task={task} /></section>
          <section className="card"><h2>Messages and updates</h2>{task.permissions.canMessage && <MessageBox task={task} onChange={replace} />}<UpdateFeed updates={task.updates} stages={task.stages} /></section>
        </div>
        <div className="rs-stack">
          <DocumentsPanel task={task} onChange={replace} canUpload={task.permissions.canUpload} />
          <SubmittedDetails task={task} />
        </div>
      </div>
    </div>
  </>
}
