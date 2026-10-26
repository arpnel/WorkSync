"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StyledSelect } from "@/components/ui/styled-select";
import { currentTaxYear, hasBlockingDeclaration, isSupportedTaxYear, supportedTaxYears } from "@/lib/tax/taxDeclaration";

type Declaration = { declaration_id: string; tax_year: number; reported_threshold_status: string; status: string; submitted_at: string; reviewed_at: string | null; review_notes: string; document_url: string | null };
export default function FreelancerTaxDeclaration() {
  const [rows, setRows] = useState<Declaration[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [year, setYear] = useState(String(currentTaxYear()));
  const [thresholdStatus, setThresholdStatus] = useState("not_exceeding");
  async function request(method: "GET" | "POST", body?: unknown) {
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
  }
  useEffect(() => { void request("GET").then((result) => setRows(result.declarations ?? [])).catch((cause) => setError(cause instanceof Error ? cause.message : "Tax records unavailable.")); }, []);
  async function submit() {
    if (busy) return;
    if (!isSupportedTaxYear(year)) {
      setError("Choose a supported tax year.");
      return;
    }
    const selectedYear = Number(year);
    if (hasBlockingDeclaration(rows, selectedYear)) {
      setError(`A declaration is already pending or accepted for ${selectedYear}.`);
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
      const ticketResponse = await fetch("/api/tax-documents/upload-url", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ partyType: "freelancer", uploadKind: "withholding_declaration", taxYear: selectedYear, fileName: file.name, contentType: file.type, size: file.size }), cache: "no-store" });
      const ticket = await ticketResponse.json();
      if (!ticketResponse.ok) throw new Error(ticket.error || "Secure upload could not be prepared.");
      const path = ticket.path as string;
      const uploaded = await supabase.storage.from("verification-documents").uploadToSignedUrl(path, ticket.token, file, { contentType: ticket.contentType });
      if (uploaded.error) throw new Error("Document upload failed. Please try again.");
      await request("POST", { taxYear: selectedYear, documentPath: path, thresholdStatus });
      setFile(null);
      const input = document.getElementById("tax-declaration-file") as HTMLInputElement | null;
      if (input) input.value = "";
      const fresh = await request("GET");
      setRows(fresh.declarations ?? []);
      setNotice("Document submitted for manual review. WorkSync does not automatically verify BIR authenticity.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Document submission failed."); }
    finally { setBusy(false); }
  }
  const selectedYear = isSupportedTaxYear(year) ? Number(year) : null;
  const hasBlockingRecord = selectedYear !== null && hasBlockingDeclaration(rows, selectedYear);
  const canSubmit = selectedYear !== null && !!file && !busy && !hasBlockingRecord;
  return <section className="space-y-4 border-t pt-5">
    <div><h3 className="font-semibold">Withholding tax declaration</h3><p className="mt-1 text-sm text-muted-foreground">Submit the BIR-received sworn declaration for the selected tax year. The tax year is the period covered by the declaration; it is separate from the date the document was signed or prepared.</p></div>
    {rows.map((row) => <article key={row.declaration_id} className="flex flex-wrap justify-between gap-2 border-t pt-3 text-sm"><span>{row.tax_year} declaration ({row.reported_threshold_status.replaceAll("_", " ")})</span><span className="capitalize">{row.status.replaceAll("_", " ")}</span>{row.document_url && <a className="text-primary underline" href={row.document_url} target="_blank" rel="noreferrer">Download document</a>}{row.review_notes && <p className="w-full text-muted-foreground">Review note: {row.review_notes}</p>}</article>)}
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="tax-declaration-year">Tax year covered by this declaration</Label><StyledSelect id="tax-declaration-year" value={year} disabled={busy} aria-invalid={year !== "" && !isSupportedTaxYear(year)} onChange={(event) => { setYear(event.target.value); setError(""); }}><option value="">Choose tax year</option>{supportedTaxYears().map((supportedYear) => <option key={supportedYear} value={supportedYear}>{supportedYear}{supportedYear === currentTaxYear() ? " (current year)" : ""}</option>)}</StyledSelect>{year === "" && <p className="text-xs text-destructive">Choose the tax year covered by your declaration.</p>}{year !== "" && !isSupportedTaxYear(year) && <p className="text-xs text-destructive">Choose a tax year from 2024 through {currentTaxYear() + 1}.</p>}</div>
      <div className="space-y-2"><Label htmlFor="tax-declaration-threshold">Expected annual marketplace remittances</Label><StyledSelect id="tax-declaration-threshold" className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={thresholdStatus} onChange={(event) => setThresholdStatus(event.target.value)}><option value="not_exceeding">Up to PHP 500,000</option><option value="exceeded">Over PHP 500,000</option></StyledSelect></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="tax-declaration-file">BIR-received sworn declaration for {selectedYear ?? "the selected tax year"}</Label><Input id="tax-declaration-file" type="file" disabled={!selectedYear || busy || hasBlockingRecord} accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><p className="text-xs text-muted-foreground">PDF, JPG, or PNG up to 5 MB. The signing date does not set the tax year.</p>{!file && <p className="text-xs text-muted-foreground">Choose a document to enable submission.</p>}</div>
      <div className="sm:col-span-2"><Button type="button" disabled={!canSubmit} onClick={() => void submit()}>{busy ? "Submitting…" : "Submit for review"}</Button>{hasBlockingRecord && <p className="mt-2 text-sm text-muted-foreground">A {selectedYear} declaration is already pending or accepted. You can submit again if the existing declaration is rejected or revoked.</p>}</div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-primary">{notice}</p>}
  </section>;
}

