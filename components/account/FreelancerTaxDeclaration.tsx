"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { Check, Clock3, FileText, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StyledSelect } from "@/components/ui/styled-select";
import { AccountSetupFileDropzone } from "@/components/accountsetup/sections/AccountSetupFileDropzone";
import { hasBlockingDeclaration } from "@/lib/tax/taxDeclaration";

type Declaration = { declaration_id: string; tax_year: number; reported_threshold_status: string; status: string; submitted_at: string; reviewed_at: string | null; review_notes: string; document_url: string | null };
export type FreelancerTaxDeclarationHandle = { submitForSetup: () => Promise<void> };
const thresholdLabel = (status: string) => status === "not_exceeding"
  ? "PHP 500,000 or less"
  : status === "exceeded" ? "Over PHP 500,000" : status.replaceAll("_", " ");
const declarationStatusLabel = (status: string) => status === "accepted"
  ? "Approved"
  : status === "pending" ? "Pending review" : status.replaceAll("_", " ");
const declarationStatusClass = (status: string) => status === "accepted"
  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
  : status === "pending" ? "border-amber-500/30 bg-amber-500/10 text-amber-500" : "border-border bg-muted text-muted-foreground";
const declarationStatusIcon = (status: string) => status === "accepted"
  ? <Check className="size-4" />
  : status === "pending" ? <Clock3 className="size-4" /> : <X className="size-4" />;
const DECLARATION_TAX_YEAR = 2026;

const FreelancerTaxDeclaration = forwardRef<FreelancerTaxDeclarationHandle, { embedded?: boolean; setupMode?: boolean; profileReady?: boolean; hideSubmitButton?: boolean }>(function FreelancerTaxDeclaration({ embedded = false, setupMode = false, profileReady = true, hideSubmitButton = false }, ref) {
  const [rows, setRows] = useState<Declaration[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [thresholdStatus, setThresholdStatus] = useState("not_exceeding");
  const request = useCallback(async (method: "GET" | "POST", body?: unknown) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in to manage tax documents.");
    const response = await fetch("/api/tax-declarations", {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Tax records unavailable.");
    return result;
  }, []);
  useEffect(() => {
    if (setupMode && !profileReady) return;
    let active = true;
    void request("GET").then((result) => { if (active) setRows(result.declarations ?? []); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Tax records unavailable."); });
    return () => { active = false; };
  }, [profileReady, request, setupMode]);
  async function submit(allowProfileJustSaved = false) {
    if (busy || (!profileReady && !allowProfileJustSaved)) return;
    if (hasBlockingDeclaration(rows, DECLARATION_TAX_YEAR)) {
      setError(`A declaration is already pending or accepted for ${DECLARATION_TAX_YEAR}.`);
      return;
    }
    if (!file) {
      setError("Choose the BIR-received declaration document before submitting.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in to submit a document.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a file up to 5 MB.");
      const extension = file.name.split(".").at(-1)?.toLowerCase();
      if (!extension || !["pdf", "png", "jpg", "jpeg"].includes(extension)) throw new Error("Upload a PDF, PNG, or JPG.");
      const ticketResponse = await fetch("/api/tax-documents/upload-url", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ partyType: "freelancer", uploadKind: "withholding_declaration", taxYear: DECLARATION_TAX_YEAR, fileName: file.name, contentType: file.type, size: file.size }), cache: "no-store" });
      const ticket = await ticketResponse.json();
      if (!ticketResponse.ok) throw new Error(ticket.error || "Secure upload could not be prepared.");
      const path = ticket.path as string;
      const uploaded = await supabase.storage.from("verification-documents").uploadToSignedUrl(path, ticket.token, file, { contentType: ticket.contentType });
      if (uploaded.error) throw new Error("Document upload failed. Please try again.");
      await request("POST", { taxYear: DECLARATION_TAX_YEAR, documentPath: path, thresholdStatus });
      setFile(null);
      const fresh = await request("GET");
      setRows(fresh.declarations ?? []);
      setNotice("Document submitted for manual review. WorkSync does not automatically verify BIR authenticity.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Document submission failed."); throw cause; }
    finally { setBusy(false); }
  }
  const blockingDeclaration = rows.find((row) =>
    row.tax_year === DECLARATION_TAX_YEAR
      && (row.status === "pending" || row.status === "accepted"),
  );
  const hasBlockingRecord = hasBlockingDeclaration(rows, DECLARATION_TAX_YEAR);
  const canSubmit = profileReady && !!file && !busy && !hasBlockingRecord;
  useImperativeHandle(ref, () => ({
    async submitForSetup() {
      if (!setupMode || !file) return;
      if (busy || hasBlockingRecord) {
        const message = error || "The 2026 sworn declaration cannot be submitted with the current review status.";
        setError(message);
        throw new Error(message);
      }
      await submit(true);
    },
  }), [busy, error, file, hasBlockingRecord, setupMode, submit]);
  return <section className={embedded || setupMode ? "space-y-4" : "space-y-4 border-t pt-5"}>
    {!embedded && <div><h3 className="font-semibold">BIR sworn declaration</h3><p className="mt-1 text-sm text-muted-foreground">{setupMode ? "For tax year 2026." : "Submit the BIR-received sworn declaration for tax year 2026. Its tax year is separate from the date the document was signed or prepared."}</p></div>}
    {rows.map((row) => <article key={row.declaration_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 text-sm">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border ${declarationStatusClass(row.status)}`}>{declarationStatusIcon(row.status)}</span>
        <div className="min-w-0">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${declarationStatusClass(row.status)}`}>{declarationStatusLabel(row.status)}</span>
          <p className="mt-1 font-medium">{row.tax_year} BIR sworn declaration ({thresholdLabel(row.reported_threshold_status)})</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Submitted {new Date(row.submitted_at).toLocaleDateString()}{row.reviewed_at ? ` · Reviewed ${new Date(row.reviewed_at).toLocaleDateString()}` : ""}</p>
          {row.review_notes && <p className="mt-2 text-sm text-muted-foreground">Review note: {row.review_notes}</p>}
        </div>
      </div>
      {row.document_url && <Button asChild type="button" size="sm" variant="outline"><a href={row.document_url} target="_blank" rel="noreferrer"><FileText className="mr-2 size-4" />View document</a></Button>}
    </article>)}
    <div className="space-y-4">
      <div className="space-y-2"><Label htmlFor="tax-declaration-threshold">Expected annual marketplace remittances</Label><StyledSelect id="tax-declaration-threshold" className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={thresholdStatus} onChange={(event) => setThresholdStatus(event.target.value)}><option value="not_exceeding">PHP 500,000 or less</option><option value="exceeded">Over PHP 500,000</option></StyledSelect></div>
      <div className="space-y-2"><Label htmlFor="tax-declaration-file">BIR-signed sworn declaration for 2026</Label>
        {file ? <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/30 p-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="size-5" /></span>
          <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium text-foreground">{file.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? "PDF document" : "Image document"}</p></div>
          <Button type="button" variant="ghost" size="sm" className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setFile(null)} disabled={busy}>Remove</Button>
        </div> : <AccountSetupFileDropzone
          id="tax-declaration-file"
          accept="application/pdf,.pdf,image/png,.png,image/jpeg,.jpg,.jpeg"
          supportedTypes="PDF, JPG, or PNG (up to 5 MB)"
          disabled={busy || hasBlockingRecord}
          onFiles={(files) => {
            const next = files[0];
            if (!next) return;
            if (next.size > 5 * 1024 * 1024) {
              setFile(null);
              setError("Choose a file up to 5 MB.");
              return;
            }
            setFile(next);
            setError("");
          }}
        />}
      </div>
      {(!hideSubmitButton || hasBlockingRecord) && <div className="space-y-3">
        {!hasBlockingRecord && !setupMode && !hideSubmitButton && <p className="text-sm text-muted-foreground">The document must cover tax year 2026. It may have been signed earlier.</p>}
        {blockingDeclaration && <p role="status" className={`rounded-lg border p-3 text-sm ${declarationStatusClass(blockingDeclaration.status)}`}>
          {blockingDeclaration.status === "accepted"
            ? "Your 2026 declaration is approved. A replacement may be submitted if it is revoked."
            : "Your 2026 declaration is awaiting review. Submit a corrected version if it is rejected."}
        </p>}
        {!hideSubmitButton && <Button type="button" disabled={!canSubmit} onClick={() => void submit().catch(() => undefined)}>{busy ? "Submitting…" : "Submit for review"}</Button>}
      </div>}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-primary">{notice}</p>}
  </section>;
});

export default FreelancerTaxDeclaration;

