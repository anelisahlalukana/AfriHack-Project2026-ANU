import { useEffect, useState } from 'react'
import { getDownloadUrl } from '../../api/documents'
import { SignaturePad } from './SignaturePad'
import { AcknowledgeForm } from './AcknowledgeForm'
import { UploadSignedForm } from './UploadSignedForm'

// Single-document detail view for the signer (the client): shows the filled (unsigned) PDF and
// lets them sign in the app with the signature pad, or download it, sign it themselves and upload
// the signed copy back. The FAIS Disclosure is acknowledged with a typed name instead. Rendered as
// a modal from DocumentStatusList; advisers never open it (they only send documents).
export function DocumentCard({ clientId, documentType, label, onClose, onSigned }) {
  const [previewUrl, setPreviewUrl] = useState(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState(null) // null | 'app' | 'upload'
  const acknowledgeOnly = documentType === 'fais_disclosure'

  useEffect(() => {
    let active = true

    async function loadPreview() {
      try {
        const url = await getDownloadUrl(clientId, documentType)
        if (active) { setPreviewUrl(url); setError('') }
      } catch (error) {
        if (active) setError(error.message)
      }
    }

    loadPreview()
    return () => { active = false }
  }, [clientId, documentType])

  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" onClick={event => event.stopPropagation()}>
      <div className="section-heading">
        <div><h2>{label}</h2><p>Review the document before {acknowledgeOnly ? 'acknowledging' : 'signing'}.</p></div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {!mode ? (
        <>
          <div className="doc-preview">
            {previewUrl
              ? <iframe title={label} src={previewUrl} />
              : <p>Preparing document…</p>}
          </div>
          <div className="form-actions">
            <button type="button" onClick={onClose}>Close</button>
            {!acknowledgeOnly && <button type="button" onClick={() => setMode('upload')}>Download, sign it yourself, and upload it back</button>}
            <button type="button" className="primary" onClick={() => setMode('app')}>{acknowledgeOnly ? 'Acknowledge' : 'Sign in the app'}</button>
          </div>
        </>
      ) : acknowledgeOnly ? (
        <AcknowledgeForm
          clientId={clientId}
          documentType={documentType}
          onCancel={() => setMode(null)}
          onSigned={onSigned}
        />
      ) : mode === 'upload' ? (
        <UploadSignedForm
          clientId={clientId}
          documentType={documentType}
          previewUrl={previewUrl}
          onCancel={() => setMode(null)}
          onSigned={onSigned}
        />
      ) : (
        <SignaturePad
          clientId={clientId}
          documentType={documentType}
          onCancel={() => setMode(null)}
          onSigned={onSigned}
        />
      )}
    </div>
  </div>
}
