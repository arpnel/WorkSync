"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { BadgeCheck, Building2, Check, ChevronRight, FileCheck2, FileText, Landmark, LoaderCircle, Lock, ReceiptText, Save, ShieldCheck, UploadCloud } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StyledSelect } from "@/components/ui/styled-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import FreelancerTaxDeclaration from "@/components/account/FreelancerTaxDeclaration";
import { FreelancerSellerVerification } from "@/components/account/FreelancerSellerVerification";

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

function DocumentationStep({ number, title, note }: { number: number; title: string; note?: string }) {
  return <div className="flex min-h-7 items-center gap-3">
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-xs font-semibold text-white">{number}</span>
    <h3 className="font-semibold">{title}</h3>
    {note && <span className="text-xs font-medium text-emerald-500">{note}</span>}
  </div>;
}

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

function formatTinInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  if (digits.length > 9) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${digits.slice(9)}`;
  if (digits.length > 6) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return digits;
}

export default function TaxDocuments({ setupMode = false, settingsMode = false, refreshKey = 0, loadExistingData = true }: { setupMode?: boolean; settingsMode?: boolean; refreshKey?: number; loadExistingData?: boolean } = {}) {
  const [freelancerAvailable, setFreelancerAvailable] = useState<boolean | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
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
  const [tin, setTin] = useState("");
  const [tinSaved, setTinSaved] = useState(false);
  const [tinBusy, setTinBusy] = useState(false);
  const [tinError, setTinError] = useState("");
  const [tinNotice, setTinNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const birFileInput = useRef<HTMLInputElement>(null);

  const request = useCallback(async (method: "GET" | "POST", body?: unknown) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in to manage tax documents.");
    const endpoint = setupMode ? "/api/tax-documents?setup=1" : "/api/tax-documents";
    const response = await fetch(endpoint, {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Tax documents unavailable.");
    return result;
  }, [setupMode]);

  const load = useCallback(async () => {
    const result = await request("GET");
    const availableParties = (result.partyTypes ?? []) as Party[];
    setFreelancerAvailable(availableParties.includes("freelancer"));
    setSetupRequired(Boolean(result.setupRequired));
    setRows(result.documents ?? []);
    setCanonicalBirCor(result.canonicalBirCor ?? { document: null, needsReview: false });
  }, [request]);

  useEffect(() => {
    if (!loadExistingData) {
      setFreelancerAvailable(false);
      setSetupRequired(true);
      setRows([]);
      setCanonicalBirCor({ document: null, needsReview: false });
      setError("");
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    void load().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Tax documents unavailable.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [load, loadExistingData, refreshKey]);

  useEffect(() => {
    if (!settingsMode || freelancerAvailable !== true) return;
    let active = true;
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error();
        const response = await fetch("/api/freelancer-tax-profile/tin", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error();
        if (active) setTinSaved(result.hasTin === true);
      } catch {
        if (active) setTinError("TIN status could not be loaded. You can still enter your TIN to save it.");
      }
    })();
    return () => { active = false; };
  }, [settingsMode, freelancerAvailable]);

  async function saveTin() {
    const normalizedTin = tin.replace(/\D/g, "");
    if (!/^\d{9,12}$/.test(normalizedTin)) {
      setTinError("Enter 9 to 12 digits for your TIN.");
      setTinNotice("");
      return;
    }
    setTinBusy(true);
    setTinError("");
    setTinNotice("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in again to save your TIN.");
      const response = await fetch("/api/freelancer-tax-profile/tin", {
        method: "PUT",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tin: normalizedTin }),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "TIN could not be saved securely.");
      setTinSaved(true);
      setTin("");
      setTinNotice("TIN saved securely.");
    } catch (cause) {
      setTinError(cause instanceof Error ? cause.message : "TIN could not be saved securely.");
    } finally {
      setTinBusy(false);
    }
  }

  const categoryOptions = useMemo(() => category ? purposes.filter((option) => categoryPurposes[category].includes(option.value)) : [], [category]);
  const availablePurposes = categoryOptions.filter((option) => !rows.some((row) => row.party_type === "freelancer" && row.document_type === option.documentType && (row.claimed_tax_treatment ?? "").toLowerCase() === option.treatment.toLowerCase() && activeStatuses.has(row.status)));
  const selected = categoryOptions.find((option) => option.value === purpose && availablePurposes.some((available) => available.value === option.value)) ?? availablePurposes[0] ?? categoryOptions[0];
  const categoryRows = category ? rows.filter((row) => rowBelongsToCategory(row, category)) : [];
  const activePurpose = selected && rows.some((row) => row.party_type === "freelancer" && row.document_type === selected.documentType && (row.claimed_tax_treatment ?? "").toLowerCase() === selected.treatment.toLowerCase() && activeStatuses.has(row.status));
  const birStatus = canonicalBirCor.needsReview ? "Admin review needed" : canonicalBirCor.document ? statusLabel(canonicalBirCor.document.status) : "Not submitted";
  const birApproved = canonicalBirCor.document?.status === "verified" && !canonicalBirCor.needsReview;

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

  function handleFileDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const next = event.dataTransfer.files[0];
    if (!next) return;
    if (next.size > 5 * 1024 * 1024) {
      setFile(null);
      setError("Choose a file up to 5 MB.");
      return;
    }
    setFile(next);
    setError("");
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

  const registrationFields = <div className="space-y-4 rounded-lg border bg-card p-4">
    {canonicalBirCor.needsReview && <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">Multiple latest Form 2303 records have conflicting or tied review histories. Seller approval and tax checks are paused until an administrator selects the canonical record.</p>}
    {canonicalBirCor.document && <article className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 text-sm">
      <div className="flex items-start gap-3"><span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border ${canonicalBirCor.document.status === "verified" ? "border-emerald-500 text-emerald-500" : "border-border text-muted-foreground"}`}>{canonicalBirCor.document.status === "verified" ? <Check className="size-4" /> : <FileText className="size-4" />}</span><div><p className={`text-xs font-semibold ${canonicalBirCor.document.status === "verified" ? "text-emerald-500" : "text-foreground"}`}>{statusLabel(canonicalBirCor.document.status)}</p><p className="mt-1 font-medium">{labels.bir_cor}{canonicalBirCor.document.registered_name ? ` · ${canonicalBirCor.document.registered_name}` : ""}</p><p className="mt-0.5 text-xs text-muted-foreground">Submitted {new Date(canonicalBirCor.document.submitted_at).toLocaleDateString()}{canonicalBirCor.document.review_reason ? ` · ${canonicalBirCor.document.review_reason}` : ""}</p></div></div>
      <Button type="button" size="sm" variant="outline" onClick={() => void viewDocument(canonicalBirCor.document!.document_id)}><FileText className="mr-2 size-4" />View document</Button>
    </article>}
    {canonicalBirCor.document?.status === "rejected" && <p className="text-sm text-destructive">Review the administrator’s feedback, then submit a corrected Form 2303.</p>}
    {canonicalBirCor.document?.status !== "pending" && <div className={`grid gap-4 ${settingsMode ? "" : "items-end lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"}`}>
      <div className="space-y-2"><Label htmlFor="canonical-bir-registered-name">Registered name on Form 2303 <span className="text-destructive">*</span></Label><Input id="canonical-bir-registered-name" placeholder="Enter registered name" value={registeredName} maxLength={200} onChange={event => setRegisteredName(event.target.value)} disabled={busy} /></div>
      <div className="space-y-2"><Label htmlFor="canonical-bir-file">Form 2303 document <span className="text-destructive">*</span></Label>
        {settingsMode ? <Input ref={birFileInput} id="canonical-bir-file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" disabled={busy} onChange={event => { const next = event.target.files?.[0] ?? null; if (next && next.size > 5 * 1024 * 1024) { setFile(null); setError("Choose a file up to 5 MB."); event.target.value = ""; return; } setFile(next); setError(""); }} /> : <><input ref={birFileInput} id="canonical-bir-file" className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" disabled={busy} onChange={event => { const next = event.target.files?.[0] ?? null; if (next && next.size > 5 * 1024 * 1024) { setFile(null); setError("Choose a file up to 5 MB."); event.target.value = ""; return; } setFile(next); setError(""); }} /><button type="button" onClick={() => birFileInput.current?.click()} onDragOver={event => event.preventDefault()} onDrop={handleFileDrop} disabled={busy} className="flex min-h-[76px] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-3 text-center hover:bg-muted/40 disabled:opacity-50"><span className="flex items-center gap-2 text-sm font-medium"><UploadCloud className="size-4 shrink-0 text-emerald-500" />{file?.name ?? "Drag & drop your file or click to browse"}</span><span className="text-xs text-muted-foreground">Supported: PDF, JPG, or PNG (up to 5 MB)</span></button></>}
      </div>
      {!settingsMode && <Button type="button" className="bg-emerald-700 text-white hover:bg-emerald-600" onClick={() => void submitBirCor()} disabled={!file || !registeredName.trim() || busy || canonicalBirCor.needsReview}>{busy && <LoaderCircle className="mr-2 size-4 animate-spin" />}{busy ? "Submitting…" : canonicalBirCor.document?.status === "rejected" ? "Submit correction" : "Submit for review"}</Button>}
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-600">{notice}</p>}
  </div>;

  if (freelancerAvailable === false && !setupRequired) return null;

  return (
    <div className="space-y-4">
      {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading tax documents…</div>}
      {settingsMode && !loading && freelancerAvailable && <section className="space-y-6 rounded-2xl border bg-card p-5 shadow-xl sm:p-8" aria-labelledby="settings-tax-documents-heading">
        <header className="flex flex-col justify-between gap-3 border-b pb-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="settings-tax-documents-heading" className="text-xl font-bold tracking-tight">Tax &amp; Payout Documents</h2>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${birApproved ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>{birApproved ? "BIR Compliant" : "BIR document needed"}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Configure your Philippine tax details. TIN is required to unlock withdrawal capabilities.</p>
          </div>
        </header>
        <div className="space-y-3 rounded-xl border bg-background/40 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="settings-tax-tin" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Taxpayer Identification Number (TIN) <span className="text-destructive">*</span></label>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500"><Lock className="size-3" />Mandatory for Payouts</span>
          </div>
          <div className="relative">
            <FileText className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input id="settings-tax-tin" type="text" inputMode="numeric" autoComplete="off" maxLength={15} value={tin} aria-invalid={Boolean(tinError)} onChange={event => { setTin(formatTinInput(event.target.value)); setTinError(""); setTinNotice(""); }} disabled={tinBusy} className={`flex h-11 w-full rounded-xl border bg-card py-2 pl-10 pr-3 font-mono text-sm outline-none transition-colors focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500 ${tinError ? "border-destructive" : "border-input"}`} placeholder="000-000-000-000" />
          </div>
          <p className="text-xs text-muted-foreground">Enter your 9 or 12 digit BIR-issued individual or business Tax Identification Number.</p>
          {tinSaved && !tin && <p className="text-xs text-muted-foreground">A TIN is securely saved. Enter a new TIN to update it.</p>}
          {tinError && <p role="alert" className="text-xs text-destructive">{tinError}</p>}
          {tinNotice && <p role="status" className="text-xs text-emerald-600">{tinNotice}</p>}
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Optional Tax Documents</h3>
            <p className="text-xs text-muted-foreground">Reduces or exempts withholding tax</p>
          </div>
          <details className="group overflow-hidden rounded-xl border bg-background/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/60 text-muted-foreground"><FileText className="size-4" /></span><span className="min-w-0"><span className="block text-sm font-semibold">BIR Form 2303 (COR)</span><span className="mt-0.5 block text-xs text-muted-foreground">For BIR-registered freelancers, sole proprietors, or businesses</span></span></span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t p-4">{registrationFields}</div>
          </details>
          <details className="group overflow-hidden rounded-xl border bg-background/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/60 text-muted-foreground"><FileCheck2 className="size-4" /></span><span className="min-w-0"><span className="flex flex-wrap items-center gap-2 text-sm font-semibold">BIR Sworn Declaration <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">0.5% Tax Exemption</span></span><span className="mt-0.5 block text-xs text-muted-foreground">Under BIR Revenue Regulation 16-2023</span></span></span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t p-4"><FreelancerTaxDeclaration embedded hideSubmitButton /></div>
          </details>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" onClick={() => void saveTin()} disabled={tinBusy} className="bg-emerald-700 text-white hover:bg-emerald-600">{tinBusy ? <><LoaderCircle className="size-4 animate-spin" />Saving…</> : <><Save className="size-4" />Save Tax Profile</>}</Button>
        </div>
      </section>}
      {!settingsMode && !loading && setupRequired && <details className="group overflow-hidden rounded-xl border bg-background/30" aria-label="Form 2303 document submission">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/60 text-muted-foreground"><FileText className="size-4" /></span>
            <span className="min-w-0"><span className="block text-sm font-semibold">BIR Form 2303 (COR)</span><span className="mt-0.5 block text-xs text-muted-foreground">For BIR-registered freelancers, sole proprietors, or businesses</span></span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="space-y-4 border-t p-4">
          <div className="space-y-2">
            <Label htmlFor="setup-bir-registered-name">Registered name shown on Form 2303</Label>
            <Input id="setup-bir-registered-name" value={registeredName} maxLength={200} onChange={event => setRegisteredName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-bir-file">Form 2303 document</Label>
            <input ref={birFileInput} id="setup-bir-file" className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={event => { const next = event.target.files?.[0] ?? null; if (next && next.size > 5 * 1024 * 1024) { setFile(null); setError("Choose a file up to 5 MB."); event.target.value = ""; return; } setFile(next); setError(""); }} />
            <button type="button" onClick={() => birFileInput.current?.click()} onDragOver={event => event.preventDefault()} onDrop={handleFileDrop} className="flex min-h-[76px] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-4 text-center transition-colors hover:border-emerald-500/50 hover:bg-muted/30">
              <span className="flex items-center gap-2 text-sm font-medium"><UploadCloud className="size-4 shrink-0 text-emerald-500" />{file?.name ?? "Drag & drop your file here or browse"}</span>
              <span className="text-xs text-muted-foreground">PDF, JPG, or PNG (up to 5 MB)</span>
            </button>
          </div>
          {file && <Button type="button" size="sm" variant="ghost" onClick={() => { setFile(null); if (birFileInput.current) birFileInput.current.value = ""; }}>Remove selected file</Button>}
        </div>
      </details>}
      {!settingsMode && !loading && !setupRequired && <>
        <div className={`grid gap-4 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] ${birApproved ? "border-emerald-500/30 bg-emerald-500/5" : "bg-muted/20"}`}>
          <div className="flex items-center gap-3 sm:border-r sm:pr-4">
            <span className={`grid size-9 shrink-0 place-items-center rounded-full ${birApproved ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>{birApproved ? <Check className="size-5" /> : <ShieldCheck className="size-5" />}</span>
            <div><p className={`text-sm font-semibold ${birApproved ? "text-emerald-500" : "text-foreground"}`}>Seller registration {birApproved ? "approved" : birStatus.toLowerCase()}</p><p className="mt-0.5 text-xs text-muted-foreground">{birApproved ? "Your seller registration is approved." : canonicalBirCor.document?.status === "pending" ? "Your Form 2303 is being reviewed." : "Submit Form 2303 for seller review."}</p></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:pl-1"><div><p className="text-sm font-semibold">Form 2303 <span className={`ml-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(canonicalBirCor.document?.status ?? "not_submitted")}`}>{birStatus}</span></p><p className="mt-1 text-xs text-muted-foreground">{canonicalBirCor.document?.status === "verified" ? "Your Form 2303 has been reviewed and approved." : canonicalBirCor.document?.status === "pending" ? "Your document is awaiting administrator review." : canonicalBirCor.document?.review_reason || "A verified Form 2303 is required for seller approval."}</p></div>{canonicalBirCor.document?.submitted_at && <span className="text-xs text-muted-foreground">Submitted {new Date(canonicalBirCor.document.submitted_at).toLocaleDateString()}</span>}</div>
        </div>

        {freelancerAvailable && (setupMode ? <details className="group overflow-hidden rounded-xl border bg-background/30" aria-label="BIR Form 2303 document submission">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/60 text-muted-foreground"><FileText className="size-4" /></span><span className="min-w-0"><span className="block text-sm font-semibold">BIR Form 2303 (COR)</span><span className="mt-0.5 block text-xs text-muted-foreground">For BIR-registered freelancers, sole proprietors, or businesses</span></span></span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t p-4">{registrationFields}</div>
        </details> : <section aria-label="Seller registration documents" className="space-y-3">
          <DocumentationStep number={1} title="Seller registration" note={setupMode ? "For seller approval" : "(Required)"} />
          {registrationFields}
        </section>)}

        {!setupMode && <section aria-label="Tax document categories" className="space-y-3">
          <DocumentationStep number={2} title="Tax documents" note="(Only if applicable)" />
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => openCategory("vat")} className="group flex min-h-20 items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-emerald-500/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-500"><ReceiptText className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">VAT registration and tax status <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Conditional</span></span><span className="mt-1 block text-xs text-muted-foreground">Upload VAT registration or applicable special-treatment records when relevant.</span></span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
            <button type="button" onClick={() => openCategory("withholding")} className="group flex min-h-20 items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-emerald-500/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-500"><Landmark className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Withholding tax records <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Conditional</span></span><span className="mt-1 block text-xs text-muted-foreground">Applicable exemption certificates and supporting records.</span></span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </section>}

        {freelancerAvailable && !setupMode && <section className="space-y-3">
          <DocumentationStep number={3} title="Withholding tax declaration" />
          <div className="rounded-lg border bg-card p-4"><FreelancerTaxDeclaration embedded /></div>
        </section>}

        {freelancerAvailable && !setupMode && <section className="space-y-3">
          <DocumentationStep number={4} title="Other requirements" />
          <FreelancerSellerVerification compact />
        </section>}

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
                <div onDragOver={event => event.preventDefault()} onDrop={handleFileDrop} className={`flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4 ${setupMode ? "min-h-[76px] flex-col justify-center text-center" : ""}`}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><UploadCloud className="size-5" /></span>
                  <div className={`min-w-0 flex-1 ${setupMode ? "text-center" : ""}`}><p className="truncate text-sm font-medium">{file?.name ?? (setupMode ? "Drag & drop your file or click to browse" : "Choose a file to upload")}</p><p className="mt-1 text-xs text-muted-foreground">{setupMode ? "Supported: PDF, JPG, or PNG (up to 5 MB)" : "PDF, JPG, or PNG · up to 5 MB"}</p></div>
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
      </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
    </div>
  );
}
