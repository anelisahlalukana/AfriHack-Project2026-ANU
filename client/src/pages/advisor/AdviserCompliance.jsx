import { useParams } from 'react-router-dom'
import { ComplianceTracker } from '../../components/documents/ComplianceTracker'

export default function AdviserCompliance() {
  const { adviserId } = useParams()

  return <>
    <header className="page-heading">
      <div><h1>Adviser compliance</h1></div>
    </header>
    <ComplianceTracker key={adviserId} adviserId={adviserId} />
  </>
}
