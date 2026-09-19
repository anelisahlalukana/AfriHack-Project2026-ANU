import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import { signDocument } from "@/api/documents";

export function SignaturePad({ clientId, documentType, onCancel, onSigned }) {
  const sigRef = useRef(null);
  const [signerName, setSignerName] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | success | error
  const [error, setError] = useState(null);

  function handleClear() {
    sigRef.current?.clear();
  }

  async function handleSubmit() {
    if (!signerName.trim()) {
      setError("Signer name is required");
      return;
    }
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setError("Please draw a signature before submitting");
      return;
    }

    setError(null);
    setStatus("saving");

    try {
      const signature = sigRef.current.getTrimmedCanvas().toDataURL("image/png");
      await signDocument(clientId, documentType, { signature, signerName: signerName.trim() });
      setStatus("success");
      setTimeout(() => onSigned?.(), 600);
    } catch (err) {
      setStatus("error");
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label htmlFor="signer-name">Signer name</Label>
        <Input
          id="signer-name"
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="Full name"
          disabled={status === "saving" || status === "success"}
        />
      </div>

      <div>
        <Label>Signature</Label>
        <div className="rounded-lg border border-border bg-background">
          <SignatureCanvas
            ref={sigRef}
            penColor="#211c1a"
            canvasProps={{ className: "h-40 w-full touch-none" }}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1"
          onClick={handleClear}
          disabled={status === "saving" || status === "success"}
        >
          Clear
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {status === "success" && <p className="text-sm text-success">Signed successfully.</p>}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={status === "saving"}>
          Back
        </Button>
        <Button onClick={handleSubmit} disabled={status === "saving" || status === "success"}>
          {status === "saving" ? "Saving..." : "Submit signature"}
        </Button>
      </DialogFooter>
    </div>
  );
}
