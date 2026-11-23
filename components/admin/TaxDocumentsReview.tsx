"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminDocumentLink from "@/components/admin/AdminDocumentLink";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { supabase } from "@/lib/supabaseClient";
import { getPublicIdentities, identityName } from "@/services/profile/publicIdentityService";
import AdminPagination from "@/components/admin/AdminPagination";
import { Check, Copy, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  reviewed_at: string | null;
  review_reason: string;
  document_path: string;
  is_canonical_bir_cor: boolean;
  review_events: ReviewEvent[];
};
type ReviewDecision = "verified" | "rejected" | "expired" | "revoked";

const labels: Record<string, string> = {
  bir_cor: "BIR Certificate of Registration (Form 2303)",
  vat_registration: "VAT registration evidence",
  tax_exemption: "Tax exemption or reduced-rate evidence",
  business_tax_support: "Business tax support",
};
const dateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Not recorded";
const statusClass = (status: string) => status === "verified"
  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  : status === "pending"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : "border-border bg-muted text-muted-foreground";

export default function TaxDocumentsReview() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TaxDocument[]>([]);
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});
  const [copiedReference, setCopiedReference] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "reviewed">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [draftFromDate, setDraftFromDate] = useState("");
  const [draftToDate, setDraftToDate] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<TaxDocument | null>(null);
  const [documentReason, setDocumentReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
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
      setPage(0);
      try {
        const identities = await getPublicIdentities({ userIds: [...new Set(documents.map((row) => row.user_id))] });
        setAccountNames(Object.fromEntries(identities.profiles.map((profile) => [profile.user_id, identityName(profile, "")]).filter(([, name]) => name)));
      } catch {
        setAccountNames({});
      }
    } finally {
      setLoading(false);
    }
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

  const personLabel = (row: TaxDocument) => accountNames[row.user_id] || row.registered_name?.trim() || "Name unavailable";
  const documentLabel = (row: TaxDocument) => labels[row.document_type] ?? row.document_type;
  const pendingRows = useMemo(() => rows.filter(row => row.status === "pending"), [rows]);
  const reviewedRows = useMemo(() => rows.filter(row => row.status !== "pending"), [rows]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(row => {
      if (statusFilter === "pending" && row.status !== "pending") return false;
      if (statusFilter === "reviewed" && row.status === "pending") return false;
      const submittedDate = row.submitted_at.slice(0, 10);
      if (fromDate && submittedDate < fromDate) return false;
      if (toDate && submittedDate > toDate) return false;
      return !query || [row.document_id, documentLabel(row), personLabel(row), row.status, row.registered_name, row.document_type]
        .some(value => String(value ?? "").toLowerCase().includes(query));
    });
  }, [rows, search, statusFilter, accountNames, fromDate, toDate]);
  const visibleRows = filteredRows.slice(page * 10, (page + 1) * 10);

  function openDocument(row: TaxDocument) {
    setCopiedReference(false);
    setSelectedDocument(row);
    setDocumentReason("");
    setError("");
    setSuccess("");
  }

  function closeDocument() {
    setSelectedDocument(null);
    setDocumentReason("");
  }

  async function decideDocument(decision: ReviewDecision) {
    if (!selectedDocument || !documentReason.trim()) return;
    const row = selectedDocument;
    setBusy(row.document_id);
    setError("");
    setSuccess("");
    try {
      await postReview({ documentId: row.document_id, decision, reason: documentReason.trim() });
      await load();
      closeDocument();
      setSuccess("Document review updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save document review.");
    } finally {
      setBusy("");
    }
  }

  async function selectCanonical() {
    if (!selectedDocument || !documentReason.trim()) return;
    const row = selectedDocument;
    setBusy(row.document_id);
    setError("");
    try {
      await postReview({ action: "select_canonical_bir_cor", documentId: row.document_id, reason: documentReason.trim() });
      await load();
      closeDocument();
      setSuccess("Canonical Form 2303 updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to select canonical Form 2303.");
    } finally {
      setBusy("");
    }
  }

  const reviewHistory = (row: TaxDocument) => row.review_events.length > 0 && <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
    <p className="font-medium text-foreground">Review history</p>
    {row.review_events.map(event => <p key={event.event_id}>{event.new_status} · {event.reviewer_id} · {dateTime(event.created_at)} · {event.reason}</p>)}
  </div>;

  return <section id="business-tax-document-review" className="scroll-mt-6 space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="business-tax-documents-heading" className="text-xl font-semibold">Tax documents</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Review submitted tax documents and their current approval status.</p>
      </div>
      <Button variant="outline" size="sm" disabled={!!busy || loading} onClick={() => {
        setError("");
        setSuccess("");
        void load().catch(cause => setError(cause instanceof Error ? cause.message : "Refresh failed."));
      }}>Refresh</Button>
    </div>

    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {success && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300">{success}</p>}

    {loading && <ContentSkeleton label="Loading tax documents" variant="admin-table" count={5} />}

    {!loading && <section className="space-y-3">
      <div className="flex gap-2">
        <label className="relative block min-w-0 flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input className="h-10 bg-background pl-10" value={search} placeholder="Search tax documents or people..." aria-label="Search tax documents" onChange={event => { setSearch(event.target.value); setPage(0); }} />
        </label>
          <Popover onOpenChange={open => { if (open) { setDraftFromDate(fromDate); setDraftToDate(toDate); } }}>
            <PopoverTrigger asChild><Button type="button" variant="outline" className="h-10 shrink-0"><SlidersHorizontal className="size-4" />Filters</Button></PopoverTrigger>
            <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-4"><div className="grid gap-4">
              <label className="grid gap-1.5 text-sm font-medium">Submitted from<Input type="date" value={draftFromDate} max={draftToDate || undefined} onChange={event => setDraftFromDate(event.target.value)} /></label>
              <label className="grid gap-1.5 text-sm font-medium">Submitted to<Input type="date" value={draftToDate} min={draftFromDate || undefined} onChange={event => setDraftToDate(event.target.value)} /></label>
              <div className="flex items-center justify-end gap-3 border-t pt-3"><Button type="button" variant="outline" onClick={() => { setDraftFromDate(""); setDraftToDate(""); setFromDate(""); setToDate(""); setPage(0); }}>Clear dates</Button><Button type="button" onClick={() => { setFromDate(draftFromDate); setToDate(draftToDate); setPage(0); }}>Apply</Button></div>
            </div></PopoverContent>
          </Popover>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter tax documents by review status">
        {([
          ["all", `All documents (${rows.length})`],
          ["pending", `Needs review (${pendingRows.length})`],
          ["reviewed", `Reviewed (${reviewedRows.length})`],
        ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => { setStatusFilter(value); setPage(0); }} className={`rounded-full px-3 py-1 text-xs font-medium ${statusFilter === value ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>{label}</button>)}
      </div>
      {filteredRows.length === 0
        ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{rows.length ? "No documents match these filters." : "No tax documents have been submitted."}</p>
        : <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 text-right font-medium">Action</th></tr></thead>
            <tbody className="divide-y">{visibleRows.map(row => <tr key={row.document_id}>
              <td className="max-w-56 truncate px-4 py-3 font-medium" title={personLabel(row)}>{personLabel(row)}</td>
              <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs capitalize ${statusClass(row.status)}`}>{row.status.replaceAll("_", " ")}</span></td>
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{dateTime(row.reviewed_at ?? row.submitted_at)}</td>
              <td className="px-4 py-3 text-right"><Button variant={row.status === "pending" ? "default" : "outline"} size="sm" onClick={() => openDocument(row)}>{row.status === "pending" ? "Review" : "Details"}</Button></td>
            </tr>)}</tbody>
          </table>
        </div>}
      {filteredRows.length > 0 && <AdminPagination page={page} itemCount={filteredRows.length} onPageChange={setPage} />}
    </section>}

    <Dialog open={!!selectedDocument} onOpenChange={open => {
      if (open) return;
      if (selectedDocument && busy === selectedDocument.document_id) return;
      closeDocument();
    }}>
      {selectedDocument && <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="min-w-0 shrink-0 border-b p-5 pr-12">
          <DialogTitle>{documentLabel(selectedDocument)}</DialogTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="break-all">Reference ID: {selectedDocument.document_id}</span>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Copy document reference ID" title={copiedReference ? "Copied" : "Copy reference ID"} onClick={async () => {
              try { await navigator.clipboard.writeText(selectedDocument.document_id); setCopiedReference(true); }
              catch { setCopiedReference(false); }
            }}>{copiedReference ? <Check className="size-4" /> : <Copy className="size-4" />}</Button>
          </div>
        </DialogHeader>
        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-5">
          <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Name</dt><dd>{personLabel(selectedDocument)}</dd></div><div><dt className="text-muted-foreground">Status</dt><dd className="capitalize">{selectedDocument.status.replaceAll("_", " ")}</dd></div><div className="min-w-0"><dt className="text-muted-foreground">Account</dt><dd className="break-all">{selectedDocument.user_id}</dd></div><div className="min-w-0"><dt className="text-muted-foreground">Submitted</dt><dd className="break-words">{dateTime(selectedDocument.submitted_at)}</dd></div>{selectedDocument.registered_name && <div className="min-w-0"><dt className="text-muted-foreground">Registered name</dt><dd className="break-words">{selectedDocument.registered_name}</dd></div>}{selectedDocument.issued_at && <div><dt className="text-muted-foreground">Issued</dt><dd>{selectedDocument.issued_at}</dd></div>}{selectedDocument.expires_at && <div><dt className="text-muted-foreground">Valid through</dt><dd>{selectedDocument.expires_at}</dd></div>}{selectedDocument.tax_year && <div><dt className="text-muted-foreground">Tax year</dt><dd>{selectedDocument.tax_year}</dd></div>}{selectedDocument.claimed_tax_treatment && <div className="min-w-0"><dt className="text-muted-foreground">Requested treatment</dt><dd className="break-words">{selectedDocument.claimed_tax_treatment}</dd></div>}{selectedDocument.legal_basis && <div className="min-w-0 sm:col-span-2"><dt className="text-muted-foreground">Stated basis</dt><dd className="break-words">{selectedDocument.legal_basis}</dd></div>}</dl>
          {selectedDocument.document_path && <AdminDocumentLink source="tax_document" recordId={selectedDocument.document_id} />}
          {selectedDocument.review_reason && <p className="border-t pt-3 text-sm text-muted-foreground">Review reason: {selectedDocument.review_reason}</p>}
          {reviewHistory(selectedDocument)}
          {(selectedDocument.status === "pending" || selectedDocument.status === "verified") && <label className="grid gap-2 text-sm font-medium">{selectedDocument.status === "pending" ? "Review reason (required)" : "Reason for status change (required)"}
            <Textarea value={documentReason} onChange={event => setDocumentReason(event.target.value)} maxLength={2000} placeholder="Record the reason for this review action." />
          </label>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0 flex-wrap px-6 py-5">
          <Button variant="outline" disabled={busy === selectedDocument.document_id} onClick={closeDocument}>Close</Button>
          {selectedDocument.status === "pending" && <><Button variant="outline" disabled={!!busy || !documentReason.trim()} onClick={() => void decideDocument("rejected")}>Reject</Button><Button disabled={!!busy || !documentReason.trim()} onClick={() => void decideDocument("verified")}>{busy === selectedDocument.document_id ? "Saving…" : "Verify document"}</Button></>}
          {selectedDocument.status === "verified" && <><Button variant="outline" disabled={!!busy || !documentReason.trim()} onClick={() => void decideDocument("expired")}>Mark expired</Button><Button variant="outline" disabled={!!busy || !documentReason.trim()} onClick={() => void decideDocument("revoked")}>Revoke approval</Button>{selectedDocument.party_type === "freelancer" && selectedDocument.document_type === "bir_cor" && !selectedDocument.is_canonical_bir_cor && <Button disabled={!!busy || !documentReason.trim()} onClick={() => void selectCanonical()}>{busy === selectedDocument.document_id ? "Saving…" : "Select canonical Form 2303"}</Button>}</>}
        </DialogFooter>
      </DialogContent>}
    </Dialog>
  </section>;
}
