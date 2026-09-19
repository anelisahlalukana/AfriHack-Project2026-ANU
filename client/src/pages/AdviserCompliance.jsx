import { useParams } from 'react-router-dom'
import { ComplianceTracker } from '../components/documents/ComplianceTracker'

export default function AdviserCompliance() {
  const { adviserId } = useParams()

  return <>
    <header className="page-heading">
      <div><p className="eyebrow">COMPLIANCE</p><h1>Adviser compliance</h1></div>
    </header>
    <ComplianceTracker adviserId={adviserId} />
  </>
}
