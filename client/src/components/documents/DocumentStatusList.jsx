import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { listDocuments, getDownloadUrl, sendDocument } from '../../api/documents'
import { useAuth } from '../../hooks/useAuth'
import { isStaff } from '../../lib/authRoles'
import { DocumentCard } from './DocumentCard'

const STATUS_LABEL = {
  not_sent: 'Not sent',
  sent: 'Sent',
  signed: 'Signed',
  filed: 'Filed',
}

const STATUS_CLASS = {
  not_sent: 'badge',
  sent: 'badge status-sent',
  signed: 'badge status-signed',
  filed: 'badge',
}

// FAIS Disclosure is acknowledged, not signed; it still ends up with status 'signed'.
const ACKNOWLEDGE_TYPE = 'fais_disclosure'

// `onlySent` hides documents that haven't been sent yet (used on the client's own
// account page, where only what's actually been sent to them should show).
// `emptyMessage` is shown when there is nothing to list. `onChanged` runs after a document is signed.
// `heading={false}` drops the card's own title, for a page whose own heading already says
// "Documents" (the client's Documents tab). Advisers see it among other cards, so it stays there.
// Advisers (staff) only send documents; the client is the signer. So advisers get a "Send to
// client" action and never the sign/upload options, and clients never get "Send".
export function DocumentStatusList({ clientId, onlySent = false, emptyMessage, onChanged, heading = true }) {
  const { user } = useAuth()
  const isAdviser = isStaff(user)
  const [sendingType, setSendingType] = useState(null)
  const [documents, setDocuments] = useState(null)
  const [error, setError] = useState('')
  const [openType, setOpenType] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    listDocuments(clientId)
      .then(docs => { if (active) { setDocuments(docs); setError('') } })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [clientId, reloadKey])

  async function handleView(type) {
    try {
      const url = await getDownloadUrl(clientId, type)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setError(error.message)
    }
  }

  async function handleSend(type) {
    setSendingType(type)
    try {
      await sendDocument(clientId, type)
      setError('')
      setReloadKey(key => key + 1)
    } catch (error) {
      setError(error.message)
    } finally {
      setSendingType(null)
    }
  }

  const openDoc = documents?.find(d => d.documentType === openType)
  const visibleDocuments = onlySent ? documents?.filter(d => d.status !== 'not_sent') : documents

  return <section className="card">
    {heading && <header className="section-heading"><div><h2><FileText size={20} /> Documents</h2><p>Compliance documents for this client</p></div></header>}
    {error && <p className="error" role="alert">{error}</p>}
    {!documents && !error && <p>Loading…</p>}
    {visibleDocuments && !visibleDocuments.length && emptyMessage && <p className="empty">{emptyMessage}</p>}
    {visibleDocuments?.map(doc => {
      const acknowledge = doc.documentType === ACKNOWLEDGE_TYPE
      return <div className="detail-row doc-row" key={doc.documentType}>
        <span>
          <b>{doc.label}</b>
          {doc.signedAt && <small>{acknowledge ? 'Acknowledged' : 'Signed'} {new Date(doc.signedAt).toLocaleDateString()}</small>}
        </span>
        <span className="doc-actions">
          <span className={STATUS_CLASS[doc.status] || 'badge'}>{acknowledge && doc.status === 'signed' ? 'Acknowledged' : STATUS_LABEL[doc.status] || doc.status}</span>
          <button
            type="button"
            disabled={doc.status === 'not_sent'}
            onClick={() => handleView(doc.documentType)}
          >
            View
          </button>
          {isAdviser
            ? doc.status === 'not_sent' && (
              <button type="button" className="primary" disabled={sendingType === doc.documentType} onClick={() => handleSend(doc.documentType)}>
                {sendingType === doc.documentType ? 'Sending…' : 'Send to client'}
              </button>
            )
            : (
              <button type="button" className="primary" onClick={() => setOpenType(doc.documentType)}>
                {acknowledge ? 'Acknowledge' : 'Sign'}
              </button>
            )}
        </span>
      </div>
    })}

    {openDoc && !isAdviser && (
      <DocumentCard
        clientId={clientId}
        documentType={openDoc.documentType}
        label={openDoc.label}
        onClose={() => setOpenType(null)}
        onSigned={() => {
          setOpenType(null)
          setReloadKey(key => key + 1)
          onChanged?.()
        }}
      />
    )}
  </section>
}
