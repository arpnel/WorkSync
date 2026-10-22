"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StyledSelect } from "@/components/ui/styled-select";

type Declaration = { declaration_id: string; tax_year: number; reported_threshold_status: string; status: string; submitted_at: string; reviewed_at: string | null; review_notes: string };
export default function FreelancerTaxDeclaration() {
  const [rows, setRows] = useState<Declaration[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
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
    if (!file || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in to submit a document.");
      if (file.size > 10 * 1024 * 1024) throw new Error("Choose a file up to 10 MB.");
      const extension = file.name.split(".").at(-1)?.toLowerCase();
      if (!extension || !["pdf", "png", "jpg", "jpeg"].includes(extension)) throw new Error("Upload a PDF, PNG, or JPG.");
      const path = `${session.user.id}/tax/${year}/${crypto.randomUUID()}.${extension}`;
      const uploaded = await supabase.storage.from("verification-documents").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (uploaded.error) throw new Error("Document upload failed. Please try again.");
      await request("POST", { taxYear: year, documentPath: path, thresholdStatus });
      setFile(null);
      const input = document.getElementById("tax-declaration-file") as HTMLInputElement | null;
      if (input) input.value = "";
      const fresh = await request("GET");
      setRows(fresh.declarations ?? []);
      setNotice("Document submitted for manual review. WorkSync does not automatically verify BIR authenticity.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Document submission failed."); }
    finally { setBusy(false); }
  }
  const hasActive = rows.some((row) => row.tax_year === year && row.status === "pending");
  return <section className="space-y-3 rounded-xl border p-4">
    <div><h4 className="font-semibold">Tax records</h4><p className="mt-1 text-sm text-muted-foreground">Submit a BIR-received sworn declaration for manual review. If marketplace withholding is legally applicable and enabled for your account, an accepted declaration and current reviewed COR may support the threshold treatment. Pending or expired records do not establish an exemption.</p></div>
    {rows.map((row) => <div key={row.declaration_id} className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm"><span>{row.tax_year} declaration ({row.reported_threshold_status.replaceAll("_", " ")})</span><span className="capitalize">{row.status.replaceAll("_", " ")}</span>{row.review_notes && <p className="w-full text-muted-foreground">{row.review_notes}</p>}</div>)}
    {!hasActive && <div className="grid gap-3 sm:grid-cols-[120px_1fr_220px_auto] sm:items-end">
      <div className="space-y-2"><Label htmlFor="tax-declaration-year">Tax year</Label><Input id="tax-declaration-year" type="number" min="2024" max={new Date().getFullYear() + 1} value={year} onChange={(event) => setYear(Number(event.target.value))} /></div>
      <div className="space-y-2"><Label htmlFor="tax-declaration-file">BIR-received sworn declaration</Label><Input id="tax-declaration-file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div>
      <div className="space-y-2"><Label htmlFor="tax-declaration-threshold">Annual marketplace remittances</Label><StyledSelect id="tax-declaration-threshold" className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={thresholdStatus} onChange={(event) => setThresholdStatus(event.target.value)}><option value="not_exceeding">Not expected to exceed PHP 500,000</option><option value="exceeded">Exceeded PHP 500,000</option></StyledSelect></div><Button type="button" disabled={!file || busy} onClick={() => void submit()}>{busy ? "Submittingâ€¦" : "Submit for review"}</Button>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-primary">{notice}</p>}
  </section>;
}

