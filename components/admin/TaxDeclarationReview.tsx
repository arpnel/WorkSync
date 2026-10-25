"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Row = { declaration_id: string; user_id: string; tax_year: number; reported_threshold_status: string; document_path: string; document_url: string | null; status: string; submitted_at: string; reviewed_by: string | null; reviewed_at: string | null; review_notes: string; review_events: { event_id: string; reviewer_id: string; previous_status: string; new_status: string; reason: string; created_at: string }[]; freelancer_vat_applicable: boolean; marketplace_withholding_applicable: boolean };
export default function TaxDeclarationReview() {
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, { vat: boolean; withholding: boolean }>>({});
  const [configNotes, setConfigNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [marketplaceWithholdingEnabled, setMarketplaceWithholdingEnabled] = useState(false);
  const [revocationAvailable, setRevocationAvailable] = useState(false);
  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in as an administrator.");
    const response = await fetch("/api/admin/tax-declarations", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load tax declarations.");
    setRows(body.declarations ?? []);
    setMarketplaceWithholdingEnabled(body.marketplaceWithholdingEnabled === true);
    setRevocationAvailable(body.revocationAvailable === true);
    setConfig(Object.fromEntries((body.declarations ?? []).map((row: Row) => [row.user_id, { vat: row.freelancer_vat_applicable, withholding: row.marketplace_withholding_applicable }])));
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
    try { await send({ declarationId: row.declaration_id, decision, notes: notes[row.declaration_id] ?? "" }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save review."); }
    finally { setBusy(""); }
  }
  async function saveConfig(userId: string) {
    setBusy(userId); setError("");
    try { await send({ action: "configure", freelancerId: userId, vatApplicable: config[userId]?.vat ?? false, marketplaceWithholdingApplicable: config[userId]?.withholding ?? false, reason: configNotes[userId] ?? "" }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save VAT configuration."); }
    finally { setBusy(""); }
  }
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-semibold">Freelancer tax documents</h1><p className="mt-1 text-sm text-muted-foreground">The existing BIR-received declaration review is preserved. Enable marketplace withholding only after WorkSync confirms it is legally required. VAT treatment requires a current verified VAT registration document.</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {rows.length === 0 && <p className="rounded-xl border p-5 text-sm text-muted-foreground">No tax declarations have been submitted. Withholding follows the saved legal applicability setting; missing declarations do not create an exemption when withholding applies.</p>}
    {rows.map((row) => <article key={row.declaration_id} className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-medium">{row.tax_year} sworn declaration Â· {row.reported_threshold_status.replaceAll("_", " ")}</h2><p className="text-xs text-muted-foreground">Freelancer {row.user_id} Â· submitted {new Date(row.submitted_at).toLocaleString()}</p></div><span className="rounded-full border px-2 py-1 text-xs capitalize">{row.status}</span></div>
      {row.document_url && <a className="text-sm text-primary underline" href={row.document_url} target="_blank" rel="noreferrer">Open private document</a>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config[row.user_id]?.vat ?? false} onChange={(event) => setConfig((value) => ({ ...value, [row.user_id]: { ...value[row.user_id], vat: event.target.checked } }))} />Apply VAT only when this service is legally taxable and a current verified VAT registration is on file</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={marketplaceWithholdingEnabled && (config[row.user_id]?.withholding ?? false)} disabled={!marketplaceWithholdingEnabled} onChange={(event) => setConfig((value) => ({ ...value, [row.user_id]: { ...value[row.user_id], withholding: event.target.checked } }))} />Marketplace withholding (disabled pending WorkSync legal confirmation)</label>
      <Textarea value={configNotes[row.user_id] ?? ""} onChange={(event) => setConfigNotes(value => ({ ...value, [row.user_id]: event.target.value }))} maxLength={2000} placeholder="Reason for tax configuration change (required)" />
      <Button variant="outline" size="sm" disabled={busy === row.user_id || !configNotes[row.user_id]?.trim()} onClick={() => void saveConfig(row.user_id)}>Save tax treatment</Button>
      {(row.status === "pending" || row.status === "accepted") && <><Textarea value={notes[row.declaration_id] ?? ""} onChange={(event) => setNotes((value) => ({ ...value, [row.declaration_id]: event.target.value }))} maxLength={2000} placeholder={row.status === "accepted" ? "Reason to revoke this accepted declaration" : "Review notes"} /><div className="flex gap-2">{row.status === "pending" ? <><Button disabled={!!busy} onClick={() => void review(row, "accepted")}>Accept declaration</Button><Button variant="outline" disabled={!!busy} onClick={() => void review(row, "rejected")}>Reject declaration</Button></> : <Button variant="outline" disabled={!!busy || !revocationAvailable} onClick={() => void review(row, "revoked")}>Revoke accepted declaration</Button>}</div>{row.status === "accepted" && !revocationAvailable && <p className="text-xs text-muted-foreground">Revocation history is unavailable until the prepared tax-review migration is applied.</p>}</>}
      {row.review_notes && <p className="text-sm text-muted-foreground">Review notes: {row.review_notes}</p>}
      {row.review_events.length > 0 && <div className="text-xs text-muted-foreground">Review history: {row.review_events.map((event) => `${event.previous_status} → ${event.new_status} by ${event.reviewer_id} on ${new Date(event.created_at).toLocaleString()} — ${event.reason}`).join("; ")}</div>}
    </article>)}
  </section>;
}



