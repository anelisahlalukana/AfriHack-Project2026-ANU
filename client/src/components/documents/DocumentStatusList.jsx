import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { listDocuments, getDownloadUrl } from '../../api/documents'
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

export function DocumentStatusList({ clientId }) {
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

  const openDoc = documents?.find(d => d.documentType === openType)

  return <section className="card">
    <header className="section-heading"><div><h2><FileText size={20} /> Documents</h2><p>Compliance documents for this client</p></div></header>
    {error && <p className="error" role="alert">{error}</p>}
    {!documents && !error && <p>Loading…</p>}
    {documents?.map(doc => (
      <div className="detail-row" key={doc.documentType}>
        <span>
          <b>{doc.label}</b>
          {doc.signedAt && <small>Signed {new Date(doc.signedAt).toLocaleDateString()}</small>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={STATUS_CLASS[doc.status] || 'badge'}>{STATUS_LABEL[doc.status] || doc.status}</span>
          <button
            type="button"
            disabled={doc.status === 'not_sent'}
            onClick={() => handleView(doc.documentType)}
          >
            View
          </button>
          <button type="button" className="primary" onClick={() => setOpenType(doc.documentType)}>
            Sign
          </button>
        </span>
      </div>
    ))}

    {openDoc && (
      <DocumentCard
        clientId={clientId}
        documentType={openDoc.documentType}
        label={openDoc.label}
        status={openDoc.status}
        onClose={() => setOpenType(null)}
        onSigned={() => {
          setOpenType(null)
          setReloadKey(key => key + 1)
        }}
      />
    )}
  </section>
}
