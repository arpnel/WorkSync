"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ReviewEvent = { event_id: string; reviewer_id: string; new_status: string; reason: string; created_at: string };
type TaxDocument = {
  document_id: string;
  user_id: string;
  party_type: string;
  document_type: string;
  registered_name: string;
  claimed_tax_treatment: string;
  legal_basis: string;
  tax_year: number | null;
  issued_at: string | null;
  expires_at: string | null;
  status: string;
  submitted_at: string;
  review_reason: string;
  document_url: string | null;
  freelancer_vat_applicable: boolean;
  vat_classification: string;
  marketplace_withholding_applicable: boolean;
  is_canonical_bir_cor: boolean;
  review_events: ReviewEvent[];
};
type TaxConfig = { vat: boolean; withholding: boolean; classification: string };
type ReviewDecision = "verified" | "rejected" | "expired" | "revoked";

const labels: Record<string, string> = {
  bir_cor: "BIR Certificate of Registration",
  vat_registration: "VAT registration evidence",
  tax_exemption: "Tax exemption or reduced-rate evidence",
  business_tax_support: "Business tax support",
};
const dateTime = (value: string) => new Date(value).toLocaleString();
const statusClass = (status: string) => status === "verified"
  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
  : status === "pending"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
    : "border-muted-foreground/20 bg-muted text-muted-foreground";

export default function TaxDocumentsReview() {
  const [rows, setRows] = useState<TaxDocument[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [config, setConfig] = useState<Record<string, TaxConfig>>({});
  const [configNotes, setConfigNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [marketplaceWithholdingEnabled, setMarketplaceWithholdingEnabled] = useState(false);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in as an administrator.");
    const response = await fetch("/api/admin/tax-documents", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load tax documents.");
    const documents = (body.documents ?? []) as TaxDocument[];
    setRows(documents);
    setMarketplaceWithholdingEnabled(body.marketplaceWithholdingEnabled === true);
    setConfig(Object.fromEntries(documents
      .filter(row => row.party_type === "freelancer")
      .map(row => [row.user_id, {
        vat: row.freelancer_vat_applicable,
        withholding: row.marketplace_withholding_applicable,
        classification: row.vat_classification ?? "unverified",
      }])));
  }, []);

  useEffect(() => {
    void load().catch(cause => setError(cause instanceof Error ? cause.message : "Unable to load tax documents."));
  }, [load]);

  async function postReview(body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in as an administrator.");
    const response = await fetch("/api/admin/tax-documents", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to save tax review.");
  }

  async function saveConfig(userId: string) {
    setBusy(userId);
    setError("");
    try {
      const selected = config[userId];
      await postReview({
        action: "configure_freelancer",
        freelancerId: userId,
        vatApplicable: selected?.vat ?? false,
        vatClassification: selected?.classification ?? "unverified",
        marketplaceWithholdingApplicable: selected?.withholding ?? false,
        reason: configNotes[userId] ?? "",
      });
      await load();
      setConfigNotes(value => ({ ...value, [userId]: "" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save tax settings.");
    } finally {
      setBusy("");
    }
  }

  async function decide(row: TaxDocument, decision: ReviewDecision) {
    setBusy(row.document_id);
    setError("");
    try {
      await postReview({ documentId: row.document_id, decision, reason: reasons[row.document_id] ?? "" });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save document review.");
    } finally {
      setBusy("");
    }
  }

  async function selectCanonical(row: TaxDocument) {
    setBusy(row.document_id);
    setError("");
    try {
      await postReview({ action: "select_canonical_bir_cor", documentId: row.document_id, reason: reasons[row.document_id] ?? "" });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to select canonical Form 2303.");
    } finally {
      setBusy("");
    }
  }

  const pendingRows = rows.filter(row => row.status === "pending");
  const reviewedRows = rows.filter(row => row.status !== "pending");
  const freelancerAccounts = [...new Map(rows
    .filter(row => row.party_type === "freelancer")
    .map(row => [row.user_id, row])).values()];

  const documentSummary = (row: TaxDocument) => <div className="min-w-0">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="font-medium">{labels[row.document_type] ?? row.document_type}</h3>
      {row.is_canonical_bir_cor && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700">Canonical Form 2303</span>}
    </div>
    <p className="mt-1 text-sm text-muted-foreground">{row.party_type === "freelancer" ? "Freelancer" : "Client"} · {row.registered_name || row.user_id}</p>
  </div>;

  const documentDetails = (row: TaxDocument) => <div className="space-y-3 border-t pt-3 text-sm">
    <div className="grid gap-x-6 gap-y-2 text-muted-foreground sm:grid-cols-2">
      <p>Account: <span className="break-all text-foreground">{row.user_id}</span></p>
      <p>Submitted: <span className="text-foreground">{dateTime(row.submitted_at)}</span></p>
      {row.registered_name && <p>Registered name: <span className="text-foreground">{row.registered_name}</span></p>}
      {row.expires_at && <p>Valid through: <span className="text-foreground">{row.expires_at}</span></p>}
      {row.tax_year && <p>Tax year: <span className="text-foreground">{row.tax_year}</span></p>}
      {row.claimed_tax_treatment && <p>Requested treatment: <span className="text-foreground">{row.claimed_tax_treatment}</span></p>}
      {row.legal_basis && <p className="sm:col-span-2">Stated basis: <span className="text-foreground">{row.legal_basis}</span></p>}
    </div>
    {row.document_url && <a className="inline-flex text-sm text-primary underline" href={row.document_url} target="_blank" rel="noreferrer">Open private document</a>}
    {row.review_reason && <p className="text-muted-foreground">Review reason: {row.review_reason}</p>}
    {row.review_events.length > 0 && <details className="text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer">Review history ({row.review_events.length})</summary>
      <ul className="mt-2 space-y-1">{row.review_events.map(event => <li key={event.event_id}>{event.new_status} · {event.reviewer_id} · {dateTime(event.created_at)} · {event.reason}</li>)}</ul>
    </details>}
  </div>;

  return <section id="business-tax-document-review" className="scroll-mt-6 space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold">Business tax documents</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Review uploaded records here. Document approval is separate from tax classification; update a freelancer's treatment in their account settings below.</p>
      </div>
      <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void load().catch(cause => setError(cause instanceof Error ? cause.message : "Refresh failed."))}>Refresh</Button>
    </div>

    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

    {freelancerAccounts.length > 0 && <details className="rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span><span className="font-medium">Freelancer tax settings</span><span className="ml-2 text-sm text-muted-foreground">{freelancerAccounts.length} {freelancerAccounts.length === 1 ? "account" : "accounts"}</span></span>
        <span className="text-xs text-muted-foreground">Classification and withholding rules</span>
      </summary>
      <div className="space-y-3 border-t p-4">
        {!marketplaceWithholdingEnabled && <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Marketplace withholding is disabled until WorkSync confirms its legal applicability.</p>}
        {freelancerAccounts.map(row => <article key={row.user_id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-2">
          <div className="md:col-span-2"><p className="font-medium">{row.registered_name || "Freelancer account"}</p><p className="break-all text-xs text-muted-foreground">{row.user_id}</p></div>
          <label className="grid gap-1 text-sm">VAT classification
            <select className="h-10 rounded-md border bg-background px-3" value={config[row.user_id]?.classification ?? "unverified"} onChange={event => setConfig(value => ({ ...value, [row.user_id]: { ...value[row.user_id], vat: event.target.value === "vat_registered", classification: event.target.value } }))}>
              <option value="unverified">Unverified</option><option value="pending_review">Pending review</option><option value="vat_registered">VAT-registered</option><option value="non_vat">Non-VAT</option><option value="rejected">Rejected</option><option value="expired">Expired</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={marketplaceWithholdingEnabled && (config[row.user_id]?.withholding ?? false)} disabled={!marketplaceWithholdingEnabled} onChange={event => setConfig(value => ({ ...value, [row.user_id]: { ...value[row.user_id], withholding: event.target.checked } }))} />Marketplace withholding applies</label>
          <Textarea className="md:col-span-2" value={configNotes[row.user_id] ?? ""} onChange={event => setConfigNotes(value => ({ ...value, [row.user_id]: event.target.value }))} maxLength={2000} placeholder="Reason for changing this account's tax settings (required)" />
          <div className="md:col-span-2"><Button variant="outline" size="sm" disabled={!!busy || !configNotes[row.user_id]?.trim()} onClick={() => void saveConfig(row.user_id)}>Save settings</Button></div>
        </article>)}
      </div>
    </details>}

    {pendingRows.length === 0 && rows.length === 0 && <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No business tax documents have been submitted.</p>}
    {pendingRows.length > 0 && <div className="space-y-3">
      <div className="flex items-center gap-2"><h3 className="font-semibold">Needs review</h3><span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">{pendingRows.length}</span></div>
      {pendingRows.map(row => <article key={row.document_id} className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">{documentSummary(row)}<span className={`rounded-full border px-2.5 py-1 text-xs capitalize ${statusClass(row.status)}`}>{row.status.replaceAll("_", " ")}</span></div>
        {documentDetails(row)}
        <Textarea value={reasons[row.document_id] ?? ""} onChange={event => setReasons(value => ({ ...value, [row.document_id]: event.target.value }))} maxLength={2000} placeholder="Review reason (required)" />
        <div className="flex flex-wrap gap-2"><Button disabled={!!busy || !reasons[row.document_id]?.trim()} onClick={() => void decide(row, "verified")}>Verify document</Button><Button variant="outline" disabled={!!busy || !reasons[row.document_id]?.trim()} onClick={() => void decide(row, "rejected")}>Reject with reason</Button></div>
      </article>)}
    </div>}

    {reviewedRows.length > 0 && <details className="rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3"><span className="font-medium">Reviewed documents</span><span className="text-sm text-muted-foreground">{reviewedRows.length}</span></summary>
      <div className="space-y-2 border-t p-3">
        {reviewedRows.map(row => <details key={row.document_id} className="rounded-lg border px-3">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 py-3">{documentSummary(row)}<span className={`rounded-full border px-2.5 py-1 text-xs capitalize ${statusClass(row.status)}`}>{row.status.replaceAll("_", " ")}</span><span className="text-xs text-muted-foreground">{new Date(row.submitted_at).toLocaleDateString()}</span></summary>
          <div className="space-y-3 pb-3">{documentDetails(row)}
            {row.status === "verified" && <details className="rounded-lg bg-muted/40 p-3">
              <summary className="w-fit cursor-pointer text-sm font-medium">Manage document status</summary>
              <div className="mt-3 space-y-3"><Textarea value={reasons[row.document_id] ?? ""} onChange={event => setReasons(value => ({ ...value, [row.document_id]: event.target.value }))} maxLength={2000} placeholder="Reason for changing this review (required)" />
                <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!!busy || !reasons[row.document_id]?.trim()} onClick={() => void decide(row, "expired")}>Mark expired</Button><Button variant="outline" size="sm" disabled={!!busy || !reasons[row.document_id]?.trim()} onClick={() => void decide(row, "revoked")}>Revoke approval</Button>{row.party_type === "freelancer" && row.document_type === "bir_cor" && !row.is_canonical_bir_cor && <Button variant="outline" size="sm" disabled={!!busy || !reasons[row.document_id]?.trim()} onClick={() => void selectCanonical(row)}>Select as canonical Form 2303</Button>}</div>
              </div>
            </details>}
          </div>
        </details>)}
      </div>
    </details>}
  </section>;
}
