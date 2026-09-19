import { useEffect, useState } from 'react'
import { getDownloadUrl, sendDocument } from '../../api/documents'
import { SignaturePad } from './SignaturePad'

// Single-document detail view: shows the filled (unsigned) PDF and lets the
// adviser open the signature pad. Rendered as a modal from DocumentStatusList.
export function DocumentCard({ clientId, documentType, label, status, onClose, onSigned }) {
  const [previewUrl, setPreviewUrl] = useState(null)
  const [error, setError] = useState('')
  const [signing, setSigning] = useState(false)

  useEffect(() => {
    let active = true

    async function loadPreview() {
      try {
        if (status === 'not_sent') {
          // First time this document is opened: generate the filled PDF from
          // the template. Already-sent/signed documents keep their existing file.
          await sendDocument(clientId, documentType)
        }
        const url = await getDownloadUrl(clientId, documentType)
        if (active) { setPreviewUrl(url); setError('') }
      } catch (error) {
        if (active) setError(error.message)
      }
    }

    loadPreview()
    return () => { active = false }
  }, [clientId, documentType, status])

  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" onClick={event => event.stopPropagation()}>
      <div className="section-heading">
        <div><h2>{label}</h2><p>Review the document before signing.</p></div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {!signing ? (
        <>
          <div className="doc-preview">
            {previewUrl
              ? <iframe title={label} src={previewUrl} />
              : <p>Preparing document…</p>}
          </div>
          <div className="form-actions">
            <button type="button" onClick={onClose}>Close</button>
            <button type="button" className="primary" onClick={() => setSigning(true)}>Sign</button>
          </div>
        </>
      ) : (
        <SignaturePad
          clientId={clientId}
          documentType={documentType}
          onCancel={() => setSigning(false)}
          onSigned={onSigned}
        />
      )}
    </div>
  </div>
}
