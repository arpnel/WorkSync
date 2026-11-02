"use client";
import { useCallback, useEffect, useState } from "react";
import AdminDocumentLink from "@/components/admin/AdminDocumentLink";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Row = { declaration_id: string; user_id: string; tax_year: number; reported_threshold_status: string; document_path: string; status: string; submitted_at: string; reviewed_by: string | null; reviewed_at: string | null; review_notes: string; review_events: { event_id: string; reviewer_id: string; previous_status: string; new_status: string; reason: string; created_at: string }[] };
export default function TaxDeclarationReview() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [taxYearConfirmed, setTaxYearConfirmed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [revocationAvailable, setRevocationAvailable] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in as an administrator.");
      const response = await fetch("/api/admin/tax-declarations", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load tax declarations.");
      setRows(body.declarations ?? []);
      setRevocationAvailable(body.revocationAvailable === true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load declarations.")); }, [load]);
  async function send(body: unknown) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in as an administrator.");
    const response = await fetch("/api/admin/tax-declarations", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to save tax review.");
  }
  async function review(row: Row, decision: "accepted" | "rejected" | "revoked") {
    setBusy(row.declaration_id); setError("");
    try { await send({ declarationId: row.declaration_id, decision, notes: notes[row.declaration_id] ?? "", taxYearConfirmed: decision === "accepted" && taxYearConfirmed[row.declaration_id] === true }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save review."); }
    finally { setBusy(""); }
  }
  return <section className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
      <div>
        <h2 id="declaration-review-heading" className="text-xl font-semibold">BIR sworn declarations</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Review the freelancer&apos;s submitted BIR sworn declaration and record your decision.</p>
      </div>
      {!loading && <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? "declaration" : "declarations"}</span>}
    </header>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading && <ContentSkeleton label="Loading freelancer tax declarations" variant="list" count={3} />}
    {!loading && rows.length === 0 && <p className="rounded-xl border p-5 text-sm text-muted-foreground">No BIR sworn declarations have been submitted.</p>}
    {!loading && rows.length > 0 && <div className="grid gap-4 xl:grid-cols-2">{rows.map((row) => <article key={row.declaration_id} className="space-y-3 rounded-xl border bg-background/40 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-medium">{row.tax_year} sworn declaration · {row.reported_threshold_status.replaceAll("_", " ")}</h2><p className="text-xs text-muted-foreground">Freelancer {row.user_id} · submitted {new Date(row.submitted_at).toLocaleString()}</p></div><span className="rounded-full border px-2 py-1 text-xs capitalize">{row.status}</span></div>
      {row.document_path && <AdminDocumentLink source="tax_declaration" recordId={row.declaration_id} />}
      {row.status === "pending" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={taxYearConfirmed[row.declaration_id] === true} onChange={(event) => setTaxYearConfirmed((value) => ({ ...value, [row.declaration_id]: event.target.checked }))} /><span>I reviewed the BIR document and confirmed that it declares tax year {row.tax_year}. The document&apos;s signing or preparation date does not determine the tax year.</span></label>}
      {(row.status === "pending" || row.status === "accepted") && <><Textarea value={notes[row.declaration_id] ?? ""} onChange={(event) => setNotes((value) => ({ ...value, [row.declaration_id]: event.target.value }))} maxLength={2000} placeholder={row.status === "accepted" ? "Reason to revoke this accepted declaration" : "Review notes"} /><div className="flex gap-2">{row.status === "pending" ? <><Button disabled={!!busy || !taxYearConfirmed[row.declaration_id] || !notes[row.declaration_id]?.trim()} onClick={() => void review(row, "accepted")}>Accept declaration</Button><Button variant="outline" disabled={!!busy || !notes[row.declaration_id]?.trim()} onClick={() => void review(row, "rejected")}>Reject declaration</Button></> : <Button variant="outline" disabled={!!busy || !revocationAvailable || !notes[row.declaration_id]?.trim()} onClick={() => void review(row, "revoked")}>Revoke accepted declaration</Button>}</div>{row.status === "accepted" && !revocationAvailable && <p className="text-xs text-muted-foreground">Revocation history is unavailable until the prepared tax-review migration is applied.</p>}</>}
      {row.review_notes && <p className="text-sm text-muted-foreground">Review notes: {row.review_notes}</p>}
      {row.review_events.length > 0 && <div className="text-xs text-muted-foreground">Review history: {row.review_events.map((event) => `${event.previous_status} → ${event.new_status} by ${event.reviewer_id} on ${new Date(event.created_at).toLocaleString()} — ${event.reason}`).join("; ")}</div>}
    </article>)}</div>}
  </section>;
}



