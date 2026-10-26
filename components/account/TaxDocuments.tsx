"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StyledSelect } from "@/components/ui/styled-select";

type Party = "freelancer" | "client";
type DocType = "bir_cor" | "vat_registration" | "tax_exemption" | "business_tax_support";
type UploadPurpose = "vat_cor" | "vat_exemption" | "withholding_exemption" | "withholding_support" | "client_cor" | "client_vat" | "client_exemption" | "client_support";
type DocumentRow = { document_id: string; party_type: Party; document_type: DocType; registered_name: string; claimed_tax_treatment: string; legal_basis: string; tax_year: number | null; issued_at: string | null; expires_at: string | null; status: string; submitted_at: string; reviewed_at: string | null; review_reason: string };
type PurposeOption = { value: UploadPurpose; label: string; documentType: DocType; treatment: string };
function renewalNotice(expiresAt: string | null, status: string) {
  if (status === "expired") return "Expired; submit a renewed version.";
  if (!expiresAt) return "";
  const days = Math.ceil((new Date(`${expiresAt}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
  return days < 0 ? "Expired; submit a renewed version." : days <= 60 ? `Renewal due within ${days} day${days === 1 ? "" : "s"}.` : "";
}
const labels: Record<DocType, string> = {
  bir_cor: "BIR Certificate of Registration (BIR Form 2303)",
  vat_registration: "VAT registration evidence",
  tax_exemption: "BIR-issued tax exemption certificate or ruling",
  business_tax_support: "Other official BIR supporting document",
};
const freelancerPurposes: PurposeOption[] = [
  { value: "vat_cor", label: "VAT exemption — BIR Certificate of Registration (Form 2303)", documentType: "bir_cor", treatment: "VAT exemption" },
  { value: "vat_exemption", label: "VAT exemption — BIR-issued certificate or ruling", documentType: "tax_exemption", treatment: "VAT exemption" },
  { value: "withholding_exemption", label: "Withholding tax exemption — BIR-issued certificate or ruling", documentType: "tax_exemption", treatment: "Withholding tax exemption" },
  { value: "withholding_support", label: "Withholding tax exemption — Other official BIR supporting document", documentType: "business_tax_support", treatment: "Withholding tax exemption" },
];
const clientPurposes: PurposeOption[] = [
  { value: "client_cor", label: labels.bir_cor, documentType: "bir_cor", treatment: "" },
  { value: "client_vat", label: labels.vat_registration, documentType: "vat_registration", treatment: "" },
  { value: "client_exemption", label: labels.tax_exemption, documentType: "tax_exemption", treatment: "" },
  { value: "client_support", label: labels.business_tax_support, documentType: "business_tax_support", treatment: "" },
];

export default function TaxDocuments() {
  const [parties, setParties] = useState<Party[]>([]);
  const [party, setParty] = useState<Party>("freelancer");
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [purpose, setPurpose] = useState<UploadPurpose>("vat_cor");
  const [file, setFile] = useState<File | null>(null);
  const [registeredName, setRegisteredName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const request = useCallback(async (method: "GET" | "POST", body?: unknown) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in to manage tax documents.");
    const response = await fetch("/api/tax-documents", {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Tax documents unavailable.");
    return result;
  }, []);

  const load = useCallback(async () => {
    const result = await request("GET");
    const availableParties = (result.partyTypes ?? []) as Party[];
    setParties(availableParties);
    setRows(result.documents ?? []);
    setParty((current) => availableParties.includes(current) ? current : availableParties[0] ?? "freelancer");
  }, [request]);

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Tax documents unavailable."));
  }, [load]);

  async function submit() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in to submit tax documents.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a file up to 5 MB.");
      const ext = file.name.split(".").at(-1)?.toLowerCase();
      if (!ext || !["pdf", "png", "jpg", "jpeg"].includes(ext)) throw new Error("Upload a PDF, PNG, or JPG.");
      const options = party === "freelancer" ? freelancerPurposes : clientPurposes;
      const selected = options.find((option) => option.value === purpose) ?? options[0];
      if (selected.documentType === "bir_cor" && !registeredName.trim()) throw new Error("Enter the registered name shown on Form 2303.");
      const uploadResponse = await fetch("/api/tax-documents/upload-url", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partyType: party, documentType: selected.documentType, fileName: file.name, contentType: file.type, size: file.size }),
        cache: "no-store",
      });
      const ticket = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(ticket.error || "Secure upload could not be prepared.");
      const upload = await supabase.storage.from("verification-documents").uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.contentType });
      if (upload.error) throw new Error("Document upload failed. Try again or submit it later.");
      await request("POST", {
        partyType: party,
        documentType: selected.documentType,
        documentPath: ticket.path,
        registeredName: selected.documentType === "bir_cor" ? registeredName : "",
        claimedTaxTreatment: selected.treatment,
        legalBasis: "",
      });
      setFile(null);
      setRegisteredName("");
      const input = document.getElementById("tax-document-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await load();
      setNotice("Document submitted for review. Submission alone does not change tax treatment.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Document could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  async function viewDocument(documentId: string) {
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in to view your tax document.");
      const response = await fetch(`/api/tax-documents?documentId=${encodeURIComponent(documentId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok || typeof result.documentUrl !== "string") throw new Error(result.error || "Private document unavailable.");
      window.open(result.documentUrl, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Private document unavailable.");
    }
  }

  const options = party === "freelancer" ? freelancerPurposes : clientPurposes;
  const selected = options.find((option) => option.value === purpose) ?? options[0];
  return (
    <section className="space-y-5 rounded-xl border p-4">
      <div>
        <h3 className="font-semibold">Tax documents</h3>
        <p className="mt-1 text-sm text-muted-foreground">Choose a document to submit for review. PDF, JPG, or PNG up to 5 MB.</p>
      </div>
      {party === "freelancer" && (
        <div className="grid gap-4 rounded-lg bg-muted/30 p-4 sm:grid-cols-2">
          <div>
            <h4 className="text-sm font-medium">VAT Exemption</h4>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>BIR Certificate of Registration (BIR Form 2303)</li>
              <li>BIR-issued VAT exemption certificate or ruling, if applicable</li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-medium">Withholding Tax Exemption</h4>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>BIR-issued tax exemption certificate or ruling, if applicable</li>
              <li>Sworn declaration of income or exemption, if permitted by applicable BIR rules</li>
              <li>Other official BIR supporting documents required for the specific exemption</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Submit a sworn declaration in Payouts under Tax records.</p>
          </div>
        </div>
      )}
      {rows.map((row) => (
        <article key={row.document_id} className="grid gap-2 border-t pt-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <div>
            <p className="font-medium">{row.party_type} · {row.claimed_tax_treatment || labels[row.document_type]}</p>
            {row.registered_name && <p className="text-muted-foreground">{row.registered_name}</p>}
            {row.expires_at && <p className="text-xs text-muted-foreground">Expires {row.expires_at}</p>}
            {renewalNotice(row.expires_at, row.status) && <p className="text-xs text-muted-foreground">{renewalNotice(row.expires_at, row.status)}</p>}
            {row.review_reason && <p className="text-xs text-muted-foreground">Review: {row.review_reason}</p>}
          </div>
          <span className="capitalize text-muted-foreground">{row.status.replaceAll("_", " ")}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void viewDocument(row.document_id)}>View document</Button>
        </article>
      ))}
      {parties.length > 0 && (
        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
          {parties.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="tax-document-party">Account role</Label>
              <StyledSelect id="tax-document-party" value={party} onChange={(event) => {
                const value = event.target.value as Party;
                setParty(value);
                setPurpose(value === "freelancer" ? "vat_cor" : "client_cor");
              }}>
                {parties.map((value) => <option key={value} value={value}>{value}</option>)}
              </StyledSelect>
            </div>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="tax-document-type">Document to submit</Label>
            <StyledSelect id="tax-document-type" value={selected.value} onChange={(event) => setPurpose(event.target.value as UploadPurpose)}>
              {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </StyledSelect>
          </div>
          {selected.documentType === "bir_cor" && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="tax-registered-name">Registered name shown on Form 2303</Label>
              <Input id="tax-registered-name" required value={registeredName} maxLength={200} onChange={(event) => setRegisteredName(event.target.value)} />
            </div>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="tax-document-file">Choose file</Label>
            <Input id="tax-document-file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">PDF, JPG, or PNG · up to 5 MB</p>
          </div>
          <div className="sm:col-span-2">
            <Button type="button" disabled={!file || busy} onClick={() => void submit()}>{busy ? "Submitting…" : "Submit document"}</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
    </section>
  );
}

