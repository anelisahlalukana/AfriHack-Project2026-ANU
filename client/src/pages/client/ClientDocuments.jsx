import { useOutletContext } from 'react-router-dom'
import { DocumentStatusList } from '../../components/documents/DocumentStatusList'

// Only documents that have actually been sent to the client are shown.
export default function ClientDocuments() {
  const { client, clientError } = useOutletContext()

  return <>
    <header>
      <h1>Documents</h1>
    </header>

    {clientError && <p className="error card" role="alert">{clientError}</p>}
    {client === undefined && <p role="status">Loading…</p>}
    {client === null && !clientError && <p className="card">Your client account is ready. Contact your adviser to arrange your financial needs analysis.</p>}
    {client && <DocumentStatusList clientId={client.id} onlySent emptyMessage="Nothing has been sent to you yet. Your adviser will send any documents here." />}
  </>
}
