import { useState } from 'react'
import { signDocument } from '../../api/documents'

// For documents that are acknowledged rather than signed (FAIS Disclosure): the client
// types their full name and confirms. Goes through the same sign endpoint as
// SignaturePad, just without a drawn signature.
export function AcknowledgeForm({ clientId, documentType, onCancel, onSigned }) {
  const [signerName, setSignerName] = useState('')
  const [status, setStatus] = useState('idle') // idle | saving | success
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!signerName.trim()) {
      setError('Please type your full name to acknowledge')
      return
    }

    setError('')
    setStatus('saving')

    try {
      await signDocument(clientId, documentType, { signerName: signerName.trim() })
      setStatus('success')
      setTimeout(() => onSigned?.(), 600)
    } catch (error) {
      setStatus('idle')
      setError(error.message)
    }
  }

  return <div className="form-stack">
    <label>Your full name
      <input
        value={signerName}
        onChange={event => setSignerName(event.target.value)}
        placeholder="Full name"
        autoComplete="name"
        disabled={status === 'saving' || status === 'success'}
      />
      <small>By typing your name and confirming, you acknowledge that you have received and read this document.</small>
    </label>

    {error && <p className="error" role="alert">{error}</p>}
    {status === 'success' && <p className="auth-notice" role="status">Acknowledged.</p>}

    <div className="form-actions">
      <button type="button" onClick={onCancel} disabled={status === 'saving'}>Back</button>
      <button
        type="button"
        className="primary"
        onClick={handleSubmit}
        disabled={status === 'saving' || status === 'success'}
      >
        {status === 'saving' ? 'Saving…' : 'Confirm acknowledgement'}
      </button>
    </div>
  </div>
}
