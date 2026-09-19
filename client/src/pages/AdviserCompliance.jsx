import { useParams } from "react-router-dom";
import { ComplianceTracker } from "@/components/documents/ComplianceTracker";

// Adviser-facing compliance page. No adviser-facing shell/nav exists yet
// (client/src/pages/ has no other adviser pages), so this is a standalone
// route for now.
export default function AdviserCompliance() {
  const { adviserId } = useParams();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-xl">Adviser compliance</h1>
      <ComplianceTracker adviserId={adviserId} />
    </div>
  );
}
