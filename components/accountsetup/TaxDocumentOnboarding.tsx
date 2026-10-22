"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StyledSelect } from "@/components/ui/styled-select";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Party = "client" | "freelancer";
type DocumentType = "bir_cor" | "vat_registration" | "tax_exemption" | "business_tax_support";
export type TaxDocumentOnboardingHandle = { submit: () => Promise<void> };
const labels: Record<DocumentType, string> = {
  bir_cor: "BIR Certificate of Registration (COR)",
  vat_registration: "VAT registration evidence",
  tax_exemption: "Tax exemption or reduced-rate support",
  business_tax_support: "Business registration or other tax support",
};

const TaxDocumentOnboarding = forwardRef<TaxDocumentOnboardingHandle, { party: Party; disabled?: boolean }>(function TaxDocumentOnboarding({ party, disabled }, ref) {
  const [type, setType] = useState<DocumentType>(party === "freelancer" ? "bir_cor" : "business_tax_support");
  const [file, setFile] = useState<File | null>(null);
  const [registeredName, setRegisteredName] = useState("");
  const [treatment, setTreatment] = useState("");
  const [basis, setBasis] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "submitting" | "pending" | "error">("idle");
  const [error, setError] = useState("");
  const options: DocumentType[] = party === "freelancer" ? ["bir_cor", "vat_registration", "tax_exemption"] : ["business_tax_support", "bir_cor", "vat_registration", "tax_exemption"];

  useImperativeHandle(ref, () => ({
    async submit() {
      if (!file) return;
      setError("");
      try {
        if (file.size > 10 * 1024 * 1024) throw new Error("Choose a file up to 10 MB.");
        const extension = file.name.split(".").at(-1)?.toLowerCase();
        if (!extension || !["pdf", "png", "jpg", "jpeg"].includes(extension)) throw new Error("Choose a PDF, PNG, or JPG file.");
        if (type === "bir_cor" && !registeredName.trim()) throw new Error("Enter the registered business name shown on the COR.");
        if (expiresAt && issuedAt && expiresAt < issuedAt) throw new Error("Expiry date cannot be before the issue date.");
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Your session expired. Sign in again to submit the document.");
        const path = `${session.user.id}/tax-docs/${party}/${crypto.randomUUID()}.${extension}`;
        setPhase("uploading");
        const upload = await supabase.storage.from("verification-documents").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (upload.error) throw new Error("Private document upload failed. You can retry or skip and submit it later in Settings.");
        setPhase("submitting");
        const response = await fetch("/api/tax-documents", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ partyType: party, documentType: type, documentPath: path, registeredName, claimedTaxTreatment: treatment, legalBasis: basis, issuedAt: issuedAt || null, expiresAt: expiresAt || null }),
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
  }), [basis, expiresAt, file, issuedAt, party, registeredName, treatment, type]);

  return <section className="space-y-3 rounded-xl border p-4" aria-busy={phase === "uploading" || phase === "submitting"}>
    <div><h3 className="font-semibold">Optional tax documents</h3><p className="text-sm text-muted-foreground">You can skip this and finish setup. Submitted documents use private storage and remain pending until manual review. Approval alone does not establish a tax exemption. You can add, view, or renew documents later in <Link className="underline" href="/home/settings">Settings</Link>.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor={`${party}-tax-document-type`}>Document type</Label><StyledSelect id={`${party}-tax-document-type`} value={type} onChange={event => setType(event.target.value as DocumentType)} disabled={disabled || phase === "uploading" || phase === "submitting"}>{options.map(option => <option key={option} value={option}>{labels[option]}</option>)}</StyledSelect></div>
      <div className="space-y-2"><Label htmlFor={`${party}-tax-document-file`}>Document file (optional)</Label><Input id={`${party}-tax-document-file`} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" disabled={disabled || phase === "uploading" || phase === "submitting"} onChange={event => { setFile(event.target.files?.[0] ?? null); setPhase("idle"); setError(""); }} /></div>
      {file && <Button type="button" variant="outline" disabled={disabled || phase === "uploading" || phase === "submitting"} onClick={() => { setFile(null); setPhase("idle"); setError(""); const input = document.getElementById(`${party}-tax-document-file`) as HTMLInputElement | null; if (input) input.value = ""; }}>Skip this upload</Button>}
      {type === "bir_cor" && <div className="space-y-2"><Label htmlFor={`${party}-tax-registered-name`}>Registered business name</Label><Input id={`${party}-tax-registered-name`} value={registeredName} maxLength={200} disabled={disabled} onChange={event => setRegisteredName(event.target.value)} /></div>}
      {type === "tax_exemption" && <><div className="space-y-2"><Label htmlFor={`${party}-tax-treatment`}>Claimed treatment (if known)</Label><Input id={`${party}-tax-treatment`} value={treatment} maxLength={300} disabled={disabled} onChange={event => setTreatment(event.target.value)} /></div><div className="space-y-2"><Label htmlFor={`${party}-tax-basis`}>Stated legal basis (if known)</Label><Input id={`${party}-tax-basis`} value={basis} maxLength={1000} disabled={disabled} onChange={event => setBasis(event.target.value)} /></div></>}
      <div className="space-y-2"><Label htmlFor={`${party}-tax-issued`}>Issue date (optional)</Label><Input id={`${party}-tax-issued`} type="date" value={issuedAt} disabled={disabled} onChange={event => setIssuedAt(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor={`${party}-tax-expires`}>Expiry date, if the document has one</Label><Input id={`${party}-tax-expires`} type="date" value={expiresAt} disabled={disabled} onChange={event => setExpiresAt(event.target.value)} /></div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {phase === "uploading" && <p role="status" className="text-sm">Uploading securely to private storage...</p>}
    {phase === "submitting" && <p role="status" className="text-sm">Submitting for administrator review...</p>}
    {phase === "pending" && <p role="status" className="text-sm text-muted-foreground">Document submitted - Pending review. Review status and renewal dates are available in Settings.</p>}
    {file && phase !== "uploading" && phase !== "submitting" && phase !== "pending" && <p className="text-sm text-muted-foreground">Selected: {file.name}. Save setup to upload, or remove the file to skip.</p>}
  </section>;
});

export default TaxDocumentOnboarding;
