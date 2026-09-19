import { useState } from 'react'
import { CheckCircle2, CircleDashed, Download, Upload } from 'lucide-react'
import { getTaskFileUrl, uploadTaskFile } from '../../api/tasks'
import { fileSize, formatDateTime } from '../../lib/taskFormat'
import { Alert } from './TaskBits'

const ACCEPT = 'image/*,application/pdf,audio/*'

function UploadControl({ taskId, documentKey, label, onUploaded, upload: uploadFile }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true); setError('')
    try { onUploaded(await uploadFile(taskId, file, { documentKey, label })) }
    catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  return <span className="rs-upload">
    <label className="button" aria-busy={busy}>
      <Upload size={15} /> {busy ? 'Uploading…' : 'Upload'}
      <input className="sr-only" type="file" accept={ACCEPT} onChange={upload} disabled={busy} />
    </label>
    <Alert>{error}</Alert>
  </span>
}

const FROM = { client: 'From the client', adviser: 'From Royal Square', provider: 'From the insurer' }

// The claim/request pack: which documents are in, which are missing, and every file.
// The provider portal passes its own getFileUrl / uploadFile (its API is separate).
export function DocumentsPanel({ task, onChange, canUpload = true, getFileUrl = getTaskFileUrl, uploadFile = uploadTaskFile }) {
  const [error, setError] = useState('')
  const pack = task.documentPack
  async function open(fileId) {
    setError('')
    try { window.open(await getFileUrl(task.id, fileId), '_blank', 'noopener') }
    catch (error) { setError(error.message) }
  }
  return <section className="card">
    <header className="section-heading">
      <div><h2>Documents</h2><p>{pack.totalRequired ? `${pack.receivedRequired} of ${pack.totalRequired} required items received.` : 'Nothing is required, but you can add supporting files.'}</p></div>
      {pack.totalRequired > 0 && <span className={`rs-chip ${pack.complete ? 'ok' : 'warn'}`}>{pack.complete ? 'Complete' : 'Missing items'}</span>}
    </header>
    <div className="rs-pack">
      {pack.items.map(item => <div className="rs-pack-row" key={item.key}>
        <span>{item.received ? <CheckCircle2 size={15} color="var(--rs-ok)" /> : <CircleDashed size={15} color="var(--rs-taupe)" />} {item.label}{item.required ? '' : ' (optional)'}<small>{item.count ? `${item.count} file${item.count > 1 ? 's' : ''}` : 'Not received yet'}</small></span>
        {canUpload && <UploadControl taskId={task.id} documentKey={item.key} onUploaded={onChange} upload={uploadFile} />}
      </div>)}
      {canUpload && <div className="rs-pack-row"><span>Something else<small>Photos, voice notes or PDFs up to 15 MB</small></span><UploadControl taskId={task.id} onUploaded={onChange} upload={uploadFile} /></div>}
    </div>
    {task.files.length > 0 && <ul className="rs-files">
      {task.files.map(file => <li key={file.id} className="detail-row">
        <span>{file.label}<small>{FROM[file.actor_type] || FROM.adviser} · {fileSize(file.size_bytes)} · {formatDateTime(file.uploaded_at)}</small></span>
        <button type="button" onClick={() => open(file.id)}><Download size={14} /> Open</button>
      </li>)}
    </ul>}
    <Alert>{error}</Alert>
  </section>
}
