"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { Check, ChevronRight, FileCheck2, FileText, LoaderCircle, Lock, Save, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FreelancerTaxDeclaration from "@/components/account/FreelancerTaxDeclaration";
import { FreelancerSellerVerification } from "@/components/account/FreelancerSellerVerification";
import { AccountSetupFileDropzone } from "@/components/accountsetup/sections/AccountSetupFileDropzone";

type Party = "freelancer" | "client";
type DocType = "bir_cor";
type DocumentRow = { document_id: string; party_type: Party; document_type: DocType; registered_name: string; claimed_tax_treatment: string | null; legal_basis: string; tax_year: number | null; issued_at: string | null; expires_at: string | null; status: string; submitted_at: string; reviewed_at: string | null; review_reason: string; is_canonical_bir_cor?: boolean };
type CanonicalBirCorState = { document: DocumentRow | null; needsReview: boolean };

const labels = { bir_cor: "BIR Certificate of Registration (BIR Form 2303)" };
const BIR_SUBMISSION_NOTICE = "Form 2303 submitted for review. Seller approval and relevant tax checks will use this same reviewed record.";

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
function formatTinInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  if (digits.length > 9) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${digits.slice(9)}`;
  if (digits.length > 6) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return digits;
}

type TaxDocumentsProps = { setupMode?: boolean; settingsMode?: boolean; refreshKey?: number; loadExistingData?: boolean };
export type TaxDocumentsSetupHandle = { submitForSetup: () => Promise<void> };

const TaxDocuments = forwardRef<TaxDocumentsSetupHandle, TaxDocumentsProps>(function TaxDocuments({ setupMode = false, settingsMode = false, refreshKey = 0, loadExistingData = true }, ref) {
  const [freelancerAvailable, setFreelancerAvailable] = useState<boolean | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [canonicalBirCor, setCanonicalBirCor] = useState<CanonicalBirCorState>({ document: null, needsReview: false });
  const [file, setFile] = useState<File | null>(null);
  const [registeredName, setRegisteredName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tin, setTin] = useState("");
  const [tinSaved, setTinSaved] = useState(false);
  const [tinStatusLoading, setTinStatusLoading] = useState(false);
  const [tinBusy, setTinBusy] = useState(false);
  const [tinError, setTinError] = useState("");
  const [tinNotice, setTinNotice] = useState("");

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
    setCanonicalBirCor(result.canonicalBirCor ?? { document: null, needsReview: false });
  }, [request]);

  useEffect(() => {
    if (!loadExistingData) {
      setFreelancerAvailable(false);
      setSetupRequired(true);
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
    setTinStatusLoading(true);
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
        if (active) setTinError("TIN status could not be checked. The server will prevent duplicate submissions.");
      } finally {
        if (active) setTinStatusLoading(false);
      }
    })();
    return () => { active = false; };
  }, [settingsMode, freelancerAvailable]);

  async function saveTin() {
    if (tinSaved || tinStatusLoading || tinBusy) return;
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
      if (response.status === 409) {
        setTinSaved(true);
        setTin("");
        setTinNotice("A TIN has already been submitted for this account.");
        return;
      }
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

  const birStatus = canonicalBirCor.needsReview ? "Admin review needed" : canonicalBirCor.document ? statusLabel(canonicalBirCor.document.status) : "Not submitted";
  const birApproved = canonicalBirCor.document?.status === "verified" && !canonicalBirCor.needsReview;

  function selectBirCorFile(next: File | undefined) {
    if (!next) return;
    if (next.size > 5 * 1024 * 1024) {
      setFile(null);
      setError("Choose a file up to 5 MB.");
      return;
    }
    setFile(next);
    setError("");
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
      await load();
      setNotice(BIR_SUBMISSION_NOTICE);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Form 2303 could not be submitted.");
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  useImperativeHandle(ref, () => ({
    async submitForSetup() {
      if (!setupMode || (!file && !registeredName.trim())) return;
      if (!file || !registeredName.trim()) {
        const message = "Choose a Form 2303 file and enter the registered name before continuing.";
        setError(message);
        throw new Error(message);
      }
      if (canonicalBirCor.needsReview) {
        const message = "Form 2303 submission is paused until an administrator resolves the document review history.";
        setError(message);
        throw new Error(message);
      }
      await submitBirCor();
    },
  }), [canonicalBirCor.needsReview, file, registeredName, setupMode, submitBirCor]);

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
    {canonicalBirCor.document?.status === "rejected" && <p className="text-sm text-destructive">Review the administrator's feedback, then submit a corrected Form 2303.</p>}
    {canonicalBirCor.document?.status !== "pending" && <div className="space-y-4">
      <div className="space-y-2"><Label htmlFor="canonical-bir-registered-name">Registered name on Form 2303 <span className="text-destructive">*</span></Label><Input id="canonical-bir-registered-name" placeholder="Enter registered name" value={registeredName} maxLength={200} onChange={event => setRegisteredName(event.target.value)} disabled={busy} /></div>
      <div className="space-y-2"><Label htmlFor={settingsMode ? "canonical-bir-file" : "setup-bir-file"}>Form 2303 document <span className="text-destructive">*</span></Label>
        {file ? <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/30 p-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="size-5" /></span>
          <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium text-foreground">{file.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? "PDF document" : "Image document"}</p></div>
          <Button type="button" variant="ghost" size="sm" className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setFile(null)} disabled={busy}>Remove</Button>
        </div> : <AccountSetupFileDropzone
          id={settingsMode ? "canonical-bir-file" : "setup-bir-file"}
          accept="application/pdf,.pdf,image/png,.png,image/jpeg,.jpg,.jpeg"
          supportedTypes="PDF, JPG, or PNG (up to 5 MB)"
          disabled={busy}
          invalid={Boolean(error)}
          onFiles={(files) => selectBirCorFile(files[0])}
        />}
      </div>
      {!setupMode && <div className="flex justify-end border-t pt-4"><Button type="button" className="bg-emerald-700 text-white hover:bg-emerald-600" onClick={() => void submitBirCor().catch(() => undefined)} disabled={!file || !registeredName.trim() || busy || canonicalBirCor.needsReview}>{busy && <LoaderCircle className="mr-2 size-4 animate-spin" />}{busy ? "Submitting…" : canonicalBirCor.document?.status === "rejected" ? "Submit correction" : "Submit for review"}</Button></div>}
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
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="settings-tax-tin" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Taxpayer Identification Number (TIN) <span className="text-destructive">*</span></label>
              {tinSaved && <span role="status" className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400"><Check className="size-3.5" aria-hidden="true" />TIN submitted</span>}
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500"><Lock className="size-3" />Mandatory for Payouts</span>
          </div>
          <div className="relative">
            <FileText className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input id="settings-tax-tin" type="text" inputMode="numeric" autoComplete="off" maxLength={15} value={tin} aria-invalid={Boolean(tinError)} onChange={event => { setTin(formatTinInput(event.target.value)); setTinError(""); setTinNotice(""); }} disabled={tinBusy || tinStatusLoading || tinSaved} className={`flex h-11 w-full rounded-xl border bg-card py-2 pl-10 pr-3 font-mono text-sm outline-none transition-colors focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500 ${tinError ? "border-destructive" : "border-input"}`} placeholder="000-000-000-000" />
          </div>
          <p className="text-xs text-muted-foreground">Enter your 9 or 12 digit BIR-issued individual or business Tax Identification Number.</p>
          {tinError && <p role="alert" className="text-xs text-destructive">{tinError}</p>}
          {tinNotice && !tinSaved && <p role="status" className="text-xs text-emerald-600">{tinNotice}</p>}
          <div className="flex justify-end border-t pt-3">
            <Button type="button" onClick={() => void saveTin()} disabled={tinBusy || tinStatusLoading || tinSaved} className="bg-emerald-700 text-white hover:bg-emerald-600">
              {tinBusy ? <><LoaderCircle className="size-4 animate-spin" />Saving…</> : <><Save className="size-4" />Save Tax Profile</>}
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seller documents and declarations</h3>
            <p className="text-xs text-muted-foreground">Submit Form 2303 and the applicable BIR sworn declaration.</p>
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
              <span className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/60 text-muted-foreground"><FileCheck2 className="size-4" /></span><span className="min-w-0"><span className="flex flex-wrap items-center gap-2 text-sm font-semibold">BIR Sworn Declaration <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">0.5% Tax Exemption</span></span><span className="mt-0.5 block text-xs text-muted-foreground">BIR-received declaration for tax year 2026</span></span></span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t p-4"><FreelancerTaxDeclaration embedded /></div>
          </details>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
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
            {file ? <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/30 p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="size-5" /></span>
              <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium text-foreground">{file.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? "PDF document" : "Image document"}</p></div>
              <Button type="button" variant="ghost" size="sm" className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setFile(null)}>Remove</Button>
            </div> : <AccountSetupFileDropzone
              id="setup-bir-file"
              accept="application/pdf,.pdf,image/png,.png,image/jpeg,.jpg,.jpeg"
              supportedTypes="PDF, JPG, or PNG (up to 5 MB)"
              invalid={Boolean(error)}
              onFiles={(files) => selectBirCorFile(files[0])}
            />}
          </div>
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

        {freelancerAvailable && !setupMode && <section className="space-y-3">
          <DocumentationStep number={2} title="BIR sworn declaration" />
          <div className="rounded-lg border bg-card p-4"><FreelancerTaxDeclaration embedded /></div>
        </section>}

        {freelancerAvailable && !setupMode && <section className="space-y-3">
          <DocumentationStep number={3} title="Other requirements" />
          <FreelancerSellerVerification compact />
        </section>}

      </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && notice !== BIR_SUBMISSION_NOTICE && <p role="status" className="text-sm text-primary">{notice}</p>}
    </div>
  );
});

export default TaxDocuments;
