import { useState } from 'react'
import { Download } from 'lucide-react'
import { uploadSignedDocument } from '../../api/documents'

// The second way to sign: download the filled PDF, sign it outside the app (print, sign and scan,
// or a PDF editor) and upload the signed copy back. Goes through the upload-signed endpoint, which
// stores the file as-is as the signed copy.
export function UploadSignedForm({ clientId, documentType, previewUrl, onCancel, onSigned }) {
  const [status, setStatus] = useState('idle') // idle | saving | success
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    const file = new FormData(event.currentTarget).get('file')
    if (!file?.size) {
      setError('Choose the signed PDF to upload')
      return
    }

    setError('')
    setStatus('saving')

    try {
      await uploadSignedDocument(clientId, documentType, file)
      setStatus('success')
      setTimeout(() => onSigned?.(), 600)
    } catch (error) {
      setStatus('idle')
      setError(error.message)
    }
  }

  const busy = status === 'saving' || status === 'success'

  return <form className="form-stack" onSubmit={handleSubmit}>
    <div>
      <p style={{ marginBottom: 6, fontWeight: 500, fontSize: 13 }}>1. Download the document</p>
      {previewUrl
        ? <a className="button" href={previewUrl} target="_blank" rel="noopener noreferrer" download><Download size={16} /> Download PDF</a>
        : <p>Preparing document…</p>}
    </div>

    <p style={{ fontWeight: 500, fontSize: 13 }}>2. Sign it yourself: print, sign and scan it, or use a PDF editor.</p>

    <label>3. Upload the signed PDF
      <input type="file" name="file" accept="application/pdf,.pdf" disabled={busy} />
    </label>

    {error && <p className="error" role="alert">{error}</p>}
    {status === 'success' && <p className="auth-notice" role="status">Signed copy uploaded.</p>}

    <div className="form-actions">
      <button type="button" onClick={onCancel} disabled={status === 'saving'}>Back</button>
      <button type="submit" className="primary" disabled={busy}>
        {status === 'saving' ? 'Uploading…' : 'Upload signed copy'}
      </button>
    </div>
  </form>
}
