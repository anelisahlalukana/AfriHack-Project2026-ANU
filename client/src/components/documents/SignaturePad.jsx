import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { signDocument } from '../../api/documents'

export function SignaturePad({ clientId, documentType, onCancel, onSigned }) {
  const sigRef = useRef(null)
  const [signerName, setSignerName] = useState('')
  const [status, setStatus] = useState('idle') // idle | saving | success
  const [error, setError] = useState('')

  function handleClear() {
    sigRef.current?.clear()
  }

  async function handleSubmit() {
    if (!signerName.trim()) {
      setError('Signer name is required')
      return
    }
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setError('Please draw a signature before submitting')
      return
    }

    setError('')
    setStatus('saving')

    try {
      const signature = sigRef.current.getTrimmedCanvas().toDataURL('image/png')
      await signDocument(clientId, documentType, { signature, signerName: signerName.trim() })
      setStatus('success')
      setTimeout(() => onSigned?.(), 600)
    } catch (error) {
      setStatus('idle')
      setError(error.message)
    }
  }

  return <div className="form-stack">
    <label>Signer name
      <input
        value={signerName}
        onChange={event => setSignerName(event.target.value)}
        placeholder="Full name"
        disabled={status === 'saving' || status === 'success'}
      />
    </label>

    <div>
      <p style={{ marginBottom: 6, fontWeight: 500, fontSize: 13 }}>Signature</p>
      <div className="sig-pad">
        <SignatureCanvas ref={sigRef} penColor="#211c1a" />
      </div>
      <button
        type="button"
        onClick={handleClear}
        disabled={status === 'saving' || status === 'success'}
        style={{ marginTop: 8, padding: '5px 11px', fontSize: 12 }}
      >
        Clear
      </button>
    </div>

    {error && <p className="error" role="alert">{error}</p>}
    {status === 'success' && <p className="auth-notice" role="status">Signed successfully.</p>}

    <div className="form-actions">
      <button type="button" onClick={onCancel} disabled={status === 'saving'}>Back</button>
      <button
        type="button"
        className="primary"
        onClick={handleSubmit}
        disabled={status === 'saving' || status === 'success'}
      >
        {status === 'saving' ? 'Saving…' : 'Submit signature'}
      </button>
    </div>
  </div>
}
