import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { listDocuments } from '../../api/documents'

export default function ClientHome() {
  const { user, client, clientError } = useOutletContext()
  // Documents sent to the client that they haven't signed yet. undefined while loading.
  const [waiting, setWaiting] = useState(undefined)
  const [documentsError, setDocumentsError] = useState('')
  const name = client?.first_name || user.user_metadata?.full_name

  useEffect(() => {
    if (!client) return
    let active = true
    listDocuments(client.id)
      .then(documents => { if (active) { setWaiting(documents.filter(doc => doc.status === 'sent').length); setDocumentsError('') } })
      .catch(error => { if (active) setDocumentsError(error.message) })
    return () => { active = false }
  }, [client])

  return <>
    <header>
      <p className="eyebrow">YOUR ACCOUNT</p>
      <h1>Welcome{name ? `, ${name}` : ''}</h1>
    </header>

    {clientError && <p className="error card" role="alert">{clientError}</p>}
    {documentsError && <p className="error card" role="alert">{documentsError}</p>}

    <section className="card">
      {client === undefined && <p role="status">Loading…</p>}
      {client === null && !clientError && <p>Your client account is ready. Contact your adviser to arrange your financial needs analysis.</p>}
      {client && waiting === undefined && !documentsError && <p role="status">Checking your documents…</p>}
      {client && waiting > 0 && <>
        <h2><FileText size={20} /> {waiting === 1 ? '1 document is' : `${waiting} documents are`} waiting for you</h2>
        <p>Your adviser has sent you documents to review. Please complete them.</p>
        <Link className="button primary" to="/account/documents">Review documents</Link>
      </>}
      {client && waiting === 0 && <>
        <h2>You're all caught up</h2>
        <p>You have no documents waiting. Contact your adviser to arrange your financial needs analysis.</p>
        <Link className="button" to="/account/documents">View your documents</Link>
      </>}
    </section>
  </>
}
