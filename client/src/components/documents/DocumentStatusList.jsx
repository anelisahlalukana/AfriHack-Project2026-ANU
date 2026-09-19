import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listDocuments, getDownloadUrl } from "@/api/documents";
import { DocumentCard } from "@/components/documents/DocumentCard";

const STATUS_LABEL = {
  not_sent: "Not sent",
  sent: "Sent",
  signed: "Signed",
  filed: "Filed",
};

const STATUS_CLASSNAME = {
  not_sent: "border-border text-muted-foreground",
  sent: "border-warning/40 bg-warning/10 text-warning",
  signed: "border-success/40 bg-success/10 text-success",
  filed: "border-border bg-secondary text-secondary-foreground",
};

function StatusBadge({ status }) {
  return (
    <Badge variant="outline" className={STATUS_CLASSNAME[status] || STATUS_CLASSNAME.not_sent}>
      {STATUS_LABEL[status] || status}
    </Badge>
  );
}

export function DocumentStatusList({ clientId }) {
  const [documents, setDocuments] = useState(null);
  const [error, setError] = useState(null);
  const [openType, setOpenType] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const docs = await listDocuments(clientId);
        if (cancelled) return;
        setError(null);
        setDocuments(docs);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [clientId, reloadKey]);

  async function handleView(type) {
    try {
      const url = await getDownloadUrl(clientId, type);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>Compliance documents for this client</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-0">
        {error && <p className="pb-3 text-sm text-destructive">{error}</p>}
        {!documents && !error && <p className="text-sm text-muted-foreground">Loading...</p>}
        {documents?.map((doc, i) => (
          <div
            key={doc.documentType}
            className={`flex items-center justify-between gap-3 py-3 ${
              i > 0 ? "border-t border-border" : ""
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{doc.label}</p>
              {doc.signedAt && (
                <p className="text-xs text-muted-foreground">
                  Signed {new Date(doc.signedAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge status={doc.status} />
              <Button
                size="sm"
                variant="outline"
                disabled={doc.status === "not_sent"}
                onClick={() => handleView(doc.documentType)}
              >
                View
              </Button>
              <Button size="sm" onClick={() => setOpenType(doc.documentType)}>
                Sign
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      {openType && (
        <DocumentCard
          clientId={clientId}
          documentType={openType}
          label={documents?.find((d) => d.documentType === openType)?.label}
          status={documents?.find((d) => d.documentType === openType)?.status}
          onClose={() => setOpenType(null)}
          onSigned={() => {
            setOpenType(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </Card>
  );
}
