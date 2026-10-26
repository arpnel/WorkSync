"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Building2, ChevronRight, FileCheck2, FileText, Landmark, LoaderCircle, ReceiptText, ShieldCheck, UploadCloud } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StyledSelect } from "@/components/ui/styled-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import FreelancerTaxDeclaration from "@/components/account/FreelancerTaxDeclaration";

type Party = "freelancer" | "client";
type Category = "vat" | "withholding";
type DocType = "bir_cor" | "vat_registration" | "tax_exemption" | "business_tax_support";
type UploadPurpose = "vat_exemption" | "withholding_exemption" | "withholding_support";
type DocumentRow = { document_id: string; party_type: Party; document_type: DocType; registered_name: string; claimed_tax_treatment: string | null; legal_basis: string; tax_year: number | null; issued_at: string | null; expires_at: string | null; status: string; submitted_at: string; reviewed_at: string | null; review_reason: string; is_canonical_bir_cor?: boolean };
type PurposeOption = { value: UploadPurpose; label: string; documentType: DocType; treatment: string };
type CanonicalBirCorState = { document: DocumentRow | null; needsReview: boolean };

const labels: Record<DocType, string> = {
  bir_cor: "BIR Certificate of Registration (BIR Form 2303)",
  vat_registration: "VAT registration evidence",
  tax_exemption: "BIR-issued tax exemption certificate or ruling",
  business_tax_support: "Other official BIR supporting document",
};
const purposes: PurposeOption[] = [
  { value: "vat_exemption", label: labels.tax_exemption, documentType: "tax_exemption", treatment: "VAT exemption" },
  { value: "withholding_exemption", label: labels.tax_exemption, documentType: "tax_exemption", treatment: "Withholding tax exemption" },
  { value: "withholding_support", label: labels.business_tax_support, documentType: "business_tax_support", treatment: "Withholding tax exemption" },
];
const categoryPurposes: Record<Category, UploadPurpose[]> = {
  vat: ["vat_exemption"],
  withholding: ["withholding_exemption", "withholding_support"],
};
const activeStatuses = new Set(["pending", "verified"]);

function renewalNotice(expiresAt: string | null, status: string) {
  if (status === "expired") return "Expired; submit a renewed version.";
  if (!expiresAt) return "";
  const days = Math.ceil((new Date(`${expiresAt}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
  return days < 0 ? "Expired; submit a renewed version." : days <= 60 ? `Renewal due within ${days} day${days === 1 ? "" : "s"}.` : "";
}
function statusLabel(status: string) {
  if (status === "verified") return "Approved";
  if (status === "pending") return "Pending review";
  if (status === "rejected") return "Rejected";
  if (status === "expired") return "Expired";
  return status.replaceAll("_", " ");
}
function statusClass(status: string) {
  if (status === "verified") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  if (status === "pending") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (status === "rejected") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
}
function rowBelongsToCategory(row: DocumentRow, category: Category) {
  if (row.party_type !== "freelancer") return false;
  const treatment = (row.claimed_tax_treatment ?? "").toLowerCase();
  if (category === "vat") {
    return row.document_type === "tax_exemption" && (!treatment || treatment.includes("vat"));
  }
  return row.document_type === "business_tax_support" || (row.document_type === "tax_exemption" && (!treatment || treatment.includes("withholding")));
}

export default function TaxDocuments() {
  const [freelancerAvailable, setFreelancerAvailable] = useState<boolean | null>(null);
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [canonicalBirCor, setCanonicalBirCor] = useState<CanonicalBirCorState>({ document: null, needsReview: false });
  const [category, setCategory] = useState<Category | null>(null);
  const [purpose, setPurpose] = useState<UploadPurpose>("vat_exemption");
  const [file, setFile] = useState<File | null>(null);
  const [registeredName, setRegisteredName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const birFileInput = useRef<HTMLInputElement>(null);

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
    setFreelancerAvailable(availableParties.includes("freelancer"));
    setRows(result.documents ?? []);
    setCanonicalBirCor(result.canonicalBirCor ?? { document: null, needsReview: false });
  }, [request]);

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Tax documents unavailable."))
      .finally(() => setLoading(false));
  }, [load]);

  const categoryOptions = useMemo(() => category ? purposes.filter((option) => categoryPurposes[category].includes(option.value)) : [], [category]);
  const availablePurposes = categoryOptions.filter((option) => !rows.some((row) => row.party_type === "freelancer" && row.document_type === option.documentType && (row.claimed_tax_treatment ?? "").toLowerCase() === option.treatment.toLowerCase() && activeStatuses.has(row.status)));
  const selected = categoryOptions.find((option) => option.value === purpose && availablePurposes.some((available) => available.value === option.value)) ?? availablePurposes[0] ?? categoryOptions[0];
  const categoryRows = category ? rows.filter((row) => rowBelongsToCategory(row, category)) : [];
  const activePurpose = selected && rows.some((row) => row.party_type === "freelancer" && row.document_type === selected.documentType && (row.claimed_tax_treatment ?? "").toLowerCase() === selected.treatment.toLowerCase() && activeStatuses.has(row.status));

  function openCategory(next: Category) {
    const nextOptions = purposes.filter((option) => categoryPurposes[next].includes(option.value));
    setCategory(next);
    setPurpose(nextOptions[0].value);
    setFile(null);
    setRegisteredName("");
    setError("");
    setNotice("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit() {
    if (!file || !selected || busy || activePurpose) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in to submit tax documents.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a file up to 5 MB.");
      const ext = file.name.split(".").at(-1)?.toLowerCase();
      if (!ext || !["pdf", "png", "jpg", "jpeg"].includes(ext)) throw new Error("Upload a PDF, PNG, or JPG.");
      const uploadResponse = await fetch("/api/tax-documents/upload-url", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partyType: "freelancer", documentType: selected.documentType, fileName: file.name, contentType: file.type, size: file.size }),
        cache: "no-store",
      });
      const ticket = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(ticket.error || "Secure upload could not be prepared.");
      const upload = await supabase.storage.from("verification-documents").uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.contentType });
      if (upload.error) throw new Error("Document upload failed. Try again or submit it later.");
      await request("POST", {
        partyType: "freelancer",
        documentType: selected.documentType,
        documentPath: ticket.path,
        registeredName: "",
        claimedTaxTreatment: selected.treatment,
        legalBasis: "",
      });
      setFile(null);
      setRegisteredName("");
      if (fileInput.current) fileInput.current.value = "";
      await load();
      setNotice("Document submitted for review. Submission alone does not change tax treatment.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Document could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  async function submitBirCor() {
    if (!file || busy || canonicalBirCor.document?.status === "pending") return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in to submit Form 2303.");
      if (!registeredName.trim()) throw new Error("Enter the registered name shown on Form 2303.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a file up to 5 MB.");
      const ext = file.name.split(".").at(-1)?.toLowerCase();
      if (!ext || !["pdf", "png", "jpg", "jpeg"].includes(ext)) throw new Error("Upload a PDF, PNG, or JPG.");
      const uploadResponse = await fetch("/api/tax-documents/upload-url", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partyType: "freelancer", documentType: "bir_cor", fileName: file.name, contentType: file.type, size: file.size }),
        cache: "no-store",
      });
      const ticket = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(ticket.error || "Secure upload could not be prepared.");
      const upload = await supabase.storage.from("verification-documents").uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.contentType });
      if (upload.error) throw new Error("Document upload failed. Try again or submit it later.");
      await request("POST", { partyType: "freelancer", documentType: "bir_cor", documentPath: ticket.path, registeredName: registeredName.trim(), claimedTaxTreatment: "", legalBasis: "" });
      setFile(null);
      setRegisteredName("");
      if (birFileInput.current) birFileInput.current.value = "";
      await load();
      setNotice("Form 2303 submitted for review. Seller approval and relevant tax checks will use this same reviewed record.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Form 2303 could not be submitted.");
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

  if (freelancerAvailable === false) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentation</CardTitle>
        <CardDescription>Submit required seller registration and any applicable tax records. Reviews remain separate from tax treatment decisions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading tax documents…</div>}
        {!loading && <>
          <div className="flex gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" />
            <div>
              <p className="font-medium text-foreground">Your documents are safe with us</p>
              <p className="mt-1 text-muted-foreground">All documents are stored securely and reviewed only by authorized administrators.</p>
            </div>
          </div>

          {freelancerAvailable && <section aria-labelledby="seller-registration-title" className="space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 id="seller-registration-title" className="font-semibold">Seller Registration <span className="text-xs font-normal text-primary">Required</span></h3><p className="mt-1 text-sm text-muted-foreground">Submit BIR Form 2303 (Certificate of Registration). A current, verified record is required for seller approval; this does not replace identity or other mandatory checks.</p></div>
              {canonicalBirCor.document && <span className={`h-fit rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(canonicalBirCor.document.status)}`}>{canonicalBirCor.needsReview ? "Admin review needed" : statusLabel(canonicalBirCor.document.status)}</span>}
            </div>
            {canonicalBirCor.needsReview && <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">Multiple latest Form 2303 records have conflicting or tied review histories. Seller approval and tax checks are paused until an administrator selects the canonical record.</p>}
            {canonicalBirCor.document && <article className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/30 p-3 text-sm">
              <div><p className="font-medium">{labels.bir_cor}{canonicalBirCor.document.registered_name ? ` · ${canonicalBirCor.document.registered_name}` : ""}</p><p className="text-xs text-muted-foreground">Submitted {new Date(canonicalBirCor.document.submitted_at).toLocaleDateString()}{canonicalBirCor.document.review_reason ? ` · ${canonicalBirCor.document.review_reason}` : ""}</p></div>
              <Button type="button" size="sm" variant="outline" onClick={() => void viewDocument(canonicalBirCor.document!.document_id)}><FileText className="mr-2 size-4" />View document</Button>
            </article>}
            {canonicalBirCor.document?.status === "rejected" && <p className="text-sm text-destructive">Review the administrator’s feedback, then submit a corrected Form 2303.</p>}
            {canonicalBirCor.document?.status !== "pending" && <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="canonical-bir-registered-name">Registered name shown on Form 2303</Label><Input id="canonical-bir-registered-name" value={registeredName} maxLength={200} onChange={event => setRegisteredName(event.target.value)} disabled={busy} /></div>
              <div className="space-y-2"><Label htmlFor="canonical-bir-file">Form 2303 document</Label><input ref={birFileInput} id="canonical-bir-file" className="block w-full rounded-md border bg-background px-3 py-2 text-sm" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" disabled={busy} onChange={event => { const next = event.target.files?.[0] ?? null; if (next && next.size > 5 * 1024 * 1024) { setFile(null); setError("Choose a file up to 5 MB."); event.target.value = ""; return; } setFile(next); setError(""); }} /><p className="text-xs text-muted-foreground">Private file · PDF, JPG, or PNG up to 5 MB.</p></div>
            </div>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-600">{notice}</p>}
            {canonicalBirCor.document?.status !== "pending" && <Button type="button" onClick={() => void submitBirCor()} disabled={!file || !registeredName.trim() || busy || canonicalBirCor.needsReview}>{busy && <LoaderCircle className="mr-2 size-4 animate-spin" />}{busy ? "Submitting…" : canonicalBirCor.document?.status === "rejected" ? "Submit corrected Form 2303" : "Submit Form 2303 for review"}</Button>}
          </section>}

          <section aria-labelledby="tax-document-categories" className="space-y-3">
            <div>
              <h3 id="tax-document-categories" className="text-sm font-semibold">Choose a document category</h3>
              <p className="mt-1 text-sm text-muted-foreground">Select a category to review requirements and submit supporting documents.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => openCategory("vat")} className="group flex min-h-28 items-center gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ReceiptText className="size-5" /></span>
                <span className="min-w-0 flex-1"><span className="block font-medium">VAT Registration and Tax Status <span className="text-xs font-normal text-muted-foreground">Conditional</span></span><span className="mt-1 block text-sm text-muted-foreground">Upload VAT registration or applicable special-treatment records when relevant</span></span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
              <button type="button" onClick={() => openCategory("withholding")} className="group flex min-h-28 items-center gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Landmark className="size-5" /></span>
                <span className="min-w-0 flex-1"><span className="block font-medium">Withholding Tax Records <span className="text-xs font-normal text-muted-foreground">Conditional</span></span><span className="mt-1 block text-sm text-muted-foreground">Applicable exemption certificates and supporting records</span></span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </section>

          <Dialog open={category !== null} onOpenChange={(open) => {
            if (!open) { setCategory(null); setFile(null); setRegisteredName(""); setError(""); setNotice(""); if (fileInput.current) fileInput.current.value = ""; }
          }}>
          {category && <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader className="border-b pb-4 pr-8">
              <DialogTitle>{category === "vat" ? "VAT Registration and Tax Status" : "Withholding Tax Records"}</DialogTitle>
              <DialogDescription>{category === "vat" ? "Submit BIR records related to your VAT status." : "Submit BIR records related to withholding tax treatment."}</DialogDescription>
            </DialogHeader>
            <section aria-label="Tax document requirements and submission" className="space-y-5">

            <div className="rounded-lg border bg-muted/25 p-4">
              <h4 className="flex items-center gap-2 text-sm font-medium"><FileCheck2 className="size-4 text-primary" />Accepted documents</h4>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {category === "vat" ? <>
                  <li>Form 2303 is submitted once in the required Seller Registration section above.</li>
                  <li>BIR-issued VAT exemption certificate or ruling, if applicable</li>
                </> : <>
                  <li>BIR-issued tax exemption certificate or ruling, if applicable</li>
                  <li>Other official BIR supporting documents required for the specific exemption</li>
                </>}
              </ul>
              <div className="mt-4 grid gap-3 border-t pt-3 text-sm sm:grid-cols-2">
                <div><p className="flex items-center gap-2 font-medium"><Building2 className="size-4 text-muted-foreground" />Name on document</p><p className="mt-1 text-muted-foreground">Submit a BIR document that identifies the freelancer. Enter the registered name exactly as shown.</p></div>
                <div><p className="flex items-center gap-2 font-medium"><Landmark className="size-4 text-muted-foreground" />Where to get it</p><p className="mt-1 text-muted-foreground">Request the applicable record from the BIR office or official BIR channel that issued it.</p></div>
              </div>
              {category === "withholding" && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">The year-specific sworn declaration is a separate record. Submit it in the Withholding tax declaration section below.</p>}
            </div>

            <div className="space-y-3">
              <div><h4 className="text-sm font-medium">Your submitted documents</h4><p className="mt-1 text-xs text-muted-foreground">Review status and administrator feedback appear here.</p></div>
              {categoryRows.length ? <div className="divide-y rounded-lg border">
                {categoryRows.map((row) => <article key={row.document_id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="font-medium">{row.claimed_tax_treatment || (row.document_type === "tax_exemption" ? "Tax exemption document" : labels[row.document_type])}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{labels[row.document_type]}{row.registered_name ? ` · ${row.registered_name}` : ""}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Submitted {new Date(row.submitted_at).toLocaleDateString()}</p>
                    {row.expires_at && <p className="text-xs text-muted-foreground">Expires {row.expires_at}</p>}
                    {renewalNotice(row.expires_at, row.status) && <p className="text-xs text-muted-foreground">{renewalNotice(row.expires_at, row.status)}</p>}
                    {row.review_reason && <p className="mt-2 text-sm text-destructive">Review note: {row.review_reason}</p>}
                  </div>
                  <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => void viewDocument(row.document_id)}><FileText className="mr-2 size-4" />View document</Button>
                </article>)}
              </div> : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No documents submitted in this category yet.</div>}
            </div>

            {availablePurposes.length > 0 ? <div className="space-y-4 rounded-lg border p-4">
              <div><h4 className="font-medium">Submit a document</h4><p className="mt-1 text-sm text-muted-foreground">PDF, JPG, or PNG up to 5 MB.</p></div>
              <div className="space-y-2">
                <Label htmlFor="tax-document-type">Document type</Label>
                <StyledSelect id="tax-document-type" value={selected?.value ?? purpose} onChange={(event) => { setPurpose(event.target.value as UploadPurpose); setFile(null); setError(""); if (fileInput.current) fileInput.current.value = ""; }}>
                  {categoryOptions.filter((option) => availablePurposes.some((available) => available.value === option.value)).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </StyledSelect>
              </div>
              {selected?.documentType === "bir_cor" && <div className="space-y-2">
                <Label htmlFor="tax-registered-name">Registered name shown on Form 2303</Label>
                <Input id="tax-registered-name" required value={registeredName} maxLength={200} onChange={(event) => setRegisteredName(event.target.value)} />
              </div>}
              <div className="space-y-2">
                <Label htmlFor="tax-document-file">Choose a file to upload</Label>
                <input ref={fileInput} id="tax-document-file" className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  if (nextFile && nextFile.size > 5 * 1024 * 1024) { setFile(null); setError("Choose a file up to 5 MB."); event.target.value = ""; return; }
                  setError(""); setFile(nextFile);
                }} />
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><UploadCloud className="size-5" /></span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file?.name ?? "Choose a file to upload"}</p><p className="mt-1 text-xs text-muted-foreground">PDF, JPG, or PNG · up to 5 MB</p></div>
                  <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>{file ? "Replace file" : "Browse files"}</Button>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button type="button" variant="outline" disabled={busy} onClick={() => { setCategory(null); setFile(null); setRegisteredName(""); setError(""); setNotice(""); if (fileInput.current) fileInput.current.value = ""; }}>Cancel</Button>
                <Button type="button" disabled={!file || busy || (selected?.documentType === "bir_cor" && !registeredName.trim())} onClick={() => void submit()}>{busy && <LoaderCircle className="mr-2 size-4 animate-spin" />}{busy ? "Submitting…" : "Submit for review"}</Button>
              </div>
            </div> : <div className="flex gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm">
              <BadgeCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" /><p className="text-muted-foreground">You already have a pending or approved document for each submission type in this category. You can submit another after it is rejected or expires.</p>
            </div>}
            </section>
          </DialogContent>}
          </Dialog>
          {freelancerAvailable && <FreelancerTaxDeclaration />}
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
      </CardContent>
    </Card>
  );
}
