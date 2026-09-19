import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getDownloadUrl, sendDocument } from "@/api/documents";
import { SignaturePad } from "@/components/documents/SignaturePad";

// Single-document detail view: shows the filled (unsigned) PDF and lets the
// adviser open the signature pad. Rendered as a dialog from DocumentStatusList.
export function DocumentCard({ clientId, documentType, label, status, onClose, onSigned }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      try {
        setError(null);
        if (status === "not_sent") {
          // First time this document is opened: generate the filled PDF from
          // the template. Already-sent/signed documents keep their existing file.
          await sendDocument(clientId, documentType);
        }
        const url = await getDownloadUrl(clientId, documentType);
        if (!cancelled) setPreviewUrl(url);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [clientId, documentType, status]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>Review the document before signing.</DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!signing ? (
          <>
            <div className="h-[60vh] w-full overflow-hidden rounded-lg border border-border bg-muted">
              {previewUrl ? (
                <iframe title={label} src={previewUrl} className="h-full w-full" />
              ) : (
                <p className="p-4 text-sm text-muted-foreground">Preparing document...</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => setSigning(true)}>Sign</Button>
            </DialogFooter>
          </>
        ) : (
          <SignaturePad
            clientId={clientId}
            documentType={documentType}
            onCancel={() => setSigning(false)}
            onSigned={onSigned}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
