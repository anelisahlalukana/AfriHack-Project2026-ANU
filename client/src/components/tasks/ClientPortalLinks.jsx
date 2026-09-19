import { Link } from 'react-router-dom'
import { FilePlus2, ListChecks, ShieldAlert } from 'lucide-react'
import '../../styles/claims.css'

// Shown on the client account page.
export default function ClientPortalLinks() {
  return <div className="rs-portal-links">
    <Link className="button primary" to="/account/claims/new"><ShieldAlert size={16} /> Report an accident or loss</Link>
    <Link className="button" to="/account/requests/new"><FilePlus2 size={16} /> Ask for something</Link>
    <Link className="button" to="/account/claims"><ListChecks size={16} /> My claims & requests</Link>
  </div>
}
