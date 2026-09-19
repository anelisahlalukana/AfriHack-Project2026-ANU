import { useParams } from "react-router-dom";
import { DocumentStatusList } from "@/components/documents/DocumentStatusList";

// Minimal client profile page: hosts the Documents & Compliance section.
// Other client-profile content (portfolio, goals, etc.) is owned elsewhere.
export default function ClientProfile() {
  const { clientId } = useParams();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-xl">Client profile</h1>
      <DocumentStatusList clientId={clientId} />
    </div>
  );
}
