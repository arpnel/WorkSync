"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Party = "client" | "freelancer";
type DocumentType = "bir_cor";
export type TaxDocumentOnboardingHandle = { submit: () => Promise<void> };
const documentType: DocumentType = "bir_cor";

const TaxDocumentOnboarding = forwardRef<TaxDocumentOnboardingHandle, { party: Party; disabled?: boolean }>(function TaxDocumentOnboarding({ party, disabled }, ref) {
  const [file, setFile] = useState<File | null>(null);
  const [registeredName, setRegisteredName] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "submitting" | "pending" | "error">("idle");
  const [error, setError] = useState("");
  useImperativeHandle(ref, () => ({
    async submit() {
      if (!file) return;
      setError("");
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error("Choose a file up to 5 MB.");
        const extension = file.name.split(".").at(-1)?.toLowerCase();
        if (!extension || !["pdf", "png", "jpg", "jpeg"].includes(extension)) throw new Error("Choose a PDF, PNG, or JPG file.");
        if (!registeredName.trim()) throw new Error("Enter the registered business name shown on the COR.");
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Your session expired. Sign in again to submit the document.");
        setPhase("uploading");
        const ticketResponse = await fetch("/api/tax-documents/upload-url", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ partyType: party, documentType, fileName: file.name, contentType: file.type, size: file.size }), cache: "no-store" });
        const ticket = await ticketResponse.json().catch(() => null);
        if (!ticketResponse.ok) throw new Error(typeof ticket?.error === "string" ? ticket.error : "Secure upload could not be prepared.");
        const upload = await supabase.storage.from("verification-documents").uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.contentType });
        if (upload.error) throw new Error("Private document upload failed. Retry or skip and submit it later in Settings.");
        setPhase("submitting");
        const response = await fetch("/api/tax-documents", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ partyType: party, documentType, documentPath: ticket.path, registeredName }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "Document could not be submitted. Retry or submit it later in Settings.");
        setPhase("pending");
        setFile(null);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Document upload failed.";
        setError(message);
        setPhase("error");
        throw new Error(message);
      }
    },
  }), [file, party, registeredName]);

  return <section className="space-y-3 rounded-xl border p-4" aria-busy={phase === "uploading" || phase === "submitting"}>
    <div><h3 className="font-semibold">BIR Form 2303</h3><p className="text-sm text-muted-foreground">Submit your certificate of registration for manual review. Submit a sworn declaration separately in Settings under Documentation.</p><p className="mt-1 text-sm text-muted-foreground">PDF, JPG, or PNG up to 5 MB.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor={`${party}-tax-document-file`}>Upload Document (optional)</Label><Input id={`${party}-tax-document-file`} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" disabled={disabled || phase === "uploading" || phase === "submitting"} onChange={event => { setFile(event.target.files?.[0] ?? null); setPhase("idle"); setError(""); }} /><p className="text-xs text-muted-foreground">PDF, JPG, or PNG - up to 5 MB</p></div>
      {file && <Button type="button" variant="outline" disabled={disabled || phase === "uploading" || phase === "submitting"} onClick={() => { setFile(null); setPhase("idle"); setError(""); const input = document.getElementById(`${party}-tax-document-file`) as HTMLInputElement | null; if (input) input.value = ""; }}>Skip for Now</Button>}
      <div className="space-y-2"><Label htmlFor={`${party}-tax-registered-name`}>Registered business name</Label><Input id={`${party}-tax-registered-name`} value={registeredName} maxLength={200} disabled={disabled} onChange={event => setRegisteredName(event.target.value)} /></div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {phase === "uploading" && <p role="status" className="text-sm">Uploading securely to private storage...</p>}
    {phase === "submitting" && <p role="status" className="text-sm">Submitting for Verification...</p>}
    {phase === "pending" && <p role="status" className="text-sm text-muted-foreground">Document submitted - Pending Review. Status and feedback are available in Settings.</p>}
    {file && phase !== "submitting" && phase !== "pending" && <p className="text-sm text-muted-foreground">Selected: {file.name}. Save setup to submit for verification, or choose Skip for Now.</p>}
  </section>;
});

export default TaxDocumentOnboarding;
