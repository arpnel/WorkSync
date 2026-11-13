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

type ReviewEvent = {
  event_id: string;
  reviewer_id: string;
  previous_status: string;
  new_status: string;
  reason: string;
  created_at: string;
};
type Row = {
  declaration_id: string;
  user_id: string;
  tax_year: number;
  reported_threshold_status: string;
  document_path: string;
  status: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string;
  review_events: ReviewEvent[];
};

const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : "Not recorded";
const statusClass = (status: string) => status === "accepted"
  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  : status === "pending"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : status === "rejected"
      ? "border-destructive/30 bg-destructive/5 text-destructive"
      : "border-border bg-muted text-muted-foreground";

export default function TaxDeclarationReview() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [freelancerNames, setFreelancerNames] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "reviewed">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [draftFromDate, setDraftFromDate] = useState("");
  const [draftToDate, setDraftToDate] = useState("");
  const [copiedReference, setCopiedReference] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [taxYearConfirmed, setTaxYearConfirmed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedDeclaration, setSelectedDeclaration] = useState<Row | null>(null);
  const [revocationAvailable, setRevocationAvailable] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in as an administrator.");
      const response = await fetch("/api/admin/tax-declarations", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load tax declarations.");
      const declarations = (body.declarations ?? []) as Row[];
      setRows(declarations);
      setPage(0);
      try {
        const identities = await getPublicIdentities({ userIds: [...new Set(declarations.map((row) => row.user_id))] });
        setFreelancerNames(Object.fromEntries(identities.profiles.map((profile) => [profile.user_id, identityName(profile, "")]).filter(([, name]) => name)));
      } catch {
        setFreelancerNames({});
      }
      setRevocationAvailable(body.revocationAvailable === true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load declarations.")); }, [load]);
  const pendingRows = useMemo(() => rows.filter((row) => row.status === "pending"), [rows]);
  const reviewedRows = useMemo(() => rows.filter((row) => row.status !== "pending"), [rows]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === "pending" && row.status !== "pending") return false;
      if (statusFilter === "reviewed" && row.status === "pending") return false;
      const submittedDate = row.submitted_at.slice(0, 10);
      if (fromDate && submittedDate < fromDate) return false;
      if (toDate && submittedDate > toDate) return false;
      return !query || [row.declaration_id, row.tax_year, row.reported_threshold_status, row.status, freelancerNames[row.user_id]]
        .some((value) => String(value ?? "").toLowerCase().includes(query));
    });
  }, [rows, search, statusFilter, freelancerNames, fromDate, toDate]);
  const visibleRows = filteredRows.slice(page * 10, (page + 1) * 10);

  function openDeclaration(row: Row) {
    setSelectedDeclaration(row);
    setCopiedReference(false);
    setNotes((current) => ({ ...current, [row.declaration_id]: current[row.declaration_id] ?? "" }));
    setError("");
    setSuccess("");
  }

  function closeDeclaration() {
    setSelectedDeclaration(null);
  }

  async function send(body: unknown) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in as an administrator.");
    const response = await fetch("/api/admin/tax-declarations", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to save tax review.");
  }
  async function review(row: Row, decision: "accepted" | "rejected" | "revoked") {
    setBusy(row.declaration_id); setError("");
    setSuccess("");
    try {
      await send({ declarationId: row.declaration_id, decision, notes: notes[row.declaration_id] ?? "", taxYearConfirmed: decision === "accepted" && taxYearConfirmed[row.declaration_id] === true });
      await load();
      closeDeclaration();
      setSuccess("Declaration review updated.");
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save review."); }
    finally { setBusy(""); }
  }
  return (
    <section id="tax-declaration-review" className="scroll-mt-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="declaration-review-heading" className="text-xl font-semibold">
            BIR sworn declarations
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Review the freelancer&apos;s submitted BIR sworn declaration and record your decision.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!!busy || loading}
          onClick={() => {
            setError("");
            setSuccess("");
            void load().catch((cause) =>
              setError(cause instanceof Error ? cause.message : "Refresh failed."),
            );
          }}
        >
          Refresh
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {success}
        </p>
      )}

      {loading && (
        <ContentSkeleton label="Loading freelancer tax declarations" variant="admin-table" count={5} />
      )}

      {!loading && (
        <section className="space-y-3">
          <div className="flex gap-2">
            <label className="relative block min-w-0 flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input className="h-10 bg-background pl-10" value={search} placeholder="Search declarations or freelancers..." aria-label="Search sworn declarations" onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
            </label>
            <Popover onOpenChange={(open) => { if (open) { setDraftFromDate(fromDate); setDraftToDate(toDate); } }}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="h-10 shrink-0"><SlidersHorizontal className="size-4" />Filters</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-4">
                <div className="grid gap-4">
                  <label className="grid gap-1.5 text-sm font-medium">Submitted from<Input type="date" value={draftFromDate} max={draftToDate || undefined} onChange={(event) => setDraftFromDate(event.target.value)} /></label>
                  <label className="grid gap-1.5 text-sm font-medium">Submitted to<Input type="date" value={draftToDate} min={draftFromDate || undefined} onChange={(event) => setDraftToDate(event.target.value)} /></label>
                  <div className="flex items-center justify-end gap-3 border-t pt-3">
                    <Button type="button" variant="outline" onClick={() => { setDraftFromDate(""); setDraftToDate(""); setFromDate(""); setToDate(""); setPage(0); }}>Clear dates</Button>
                    <Button type="button" onClick={() => { setFromDate(draftFromDate); setToDate(draftToDate); setPage(0); }}>Apply</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter declarations by review status">
            {([
              ["all", `All declarations (${rows.length})`],
              ["pending", `Needs review (${pendingRows.length})`],
              ["reviewed", `Reviewed (${reviewedRows.length})`],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => { setStatusFilter(value); setPage(0); }} className={`rounded-full px-3 py-1 text-xs font-medium ${statusFilter === value ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {label}
              </button>
            ))}
          </div>
          {filteredRows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {rows.length ? "No declarations match these filters." : "No BIR sworn declarations have been submitted."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Tax year</th>
                    <th className="px-4 py-3 font-medium">Threshold</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                {visibleRows.map((row) => (
                    <tr key={row.declaration_id}>
                      <td className="max-w-56 truncate px-4 py-3 font-medium">
                        {freelancerNames[row.user_id] || "Name unavailable"}
                      </td>
                      <td className="px-4 py-3 font-medium">{row.tax_year}</td>
                      <td className="px-4 py-3 capitalize">{row.reported_threshold_status.replaceAll("_", " ")}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs capitalize ${statusClass(row.status)}`}>
                          {row.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {dateTime(row.reviewed_at ?? row.submitted_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                      <Button variant={row.status === "pending" ? "default" : "outline"} size="sm" onClick={() => openDeclaration(row)}>
                        {row.status === "pending" ? "Review" : "Details"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filteredRows.length > 0 && <AdminPagination page={page} itemCount={filteredRows.length} onPageChange={setPage} />}
        </section>
      )}

      <Dialog
        open={!!selectedDeclaration}
        onOpenChange={(open) => {
          if (open) return;
          if (selectedDeclaration && busy === selectedDeclaration.declaration_id) return;
          closeDeclaration();
        }}
      >
        {selectedDeclaration && (
          <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
            <DialogHeader className="min-w-0 shrink-0 border-b p-5 pr-12">
              <DialogTitle>{selectedDeclaration.tax_year} sworn declaration</DialogTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="break-all">Reference ID: {selectedDeclaration.declaration_id}</span>
                <Button type="button" variant="outline" size="icon-sm" aria-label="Copy declaration reference ID" title={copiedReference ? "Copied" : "Copy reference ID"} onClick={async () => {
                  try { await navigator.clipboard.writeText(selectedDeclaration.declaration_id); setCopiedReference(true); }
                  catch { setCopiedReference(false); }
                }}>{copiedReference ? <Check className="size-4" /> : <Copy className="size-4" />}</Button>
              </div>
            </DialogHeader>
            <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-5">
              <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Freelancer</dt>
                  <dd>{freelancerNames[selectedDeclaration.user_id] || "Name unavailable"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="capitalize">{selectedDeclaration.status.replaceAll("_", " ")}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Freelancer account</dt>
                  <dd className="break-all">{selectedDeclaration.user_id}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Tax year</dt>
                  <dd>{selectedDeclaration.tax_year}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Reported threshold</dt>
                  <dd className="capitalize">{selectedDeclaration.reported_threshold_status.replaceAll("_", " ")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Submitted</dt>
                  <dd className="break-words">{dateTime(selectedDeclaration.submitted_at)}</dd>
                </div>
                {selectedDeclaration.reviewed_at && (
                  <div>
                    <dt className="text-muted-foreground">Reviewed on</dt>
                    <dd className="break-words">{dateTime(selectedDeclaration.reviewed_at)}</dd>
                  </div>
                )}
                {selectedDeclaration.reviewed_by && (
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Reviewed by</dt>
                    <dd className="break-all">{selectedDeclaration.reviewed_by}</dd>
                  </div>
                )}
              </dl>

              {selectedDeclaration.document_path && (
                <AdminDocumentLink source="tax_declaration" recordId={selectedDeclaration.declaration_id} />
              )}

              {selectedDeclaration.review_notes && (
                <p className="border-t pt-3 text-sm text-muted-foreground">
                  Review notes: {selectedDeclaration.review_notes}
                </p>
              )}

              {selectedDeclaration.review_events.length > 0 && (
                <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Review history</p>
                  {selectedDeclaration.review_events.map((event) => (
                    <p key={event.event_id} className="break-words">
                      {event.previous_status} → {event.new_status} · {event.reviewer_id} · {dateTime(event.created_at)} · {event.reason}
                    </p>
                  ))}
                </div>
              )}

              {selectedDeclaration.status === "pending" && (
                <label className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-primary"
                    checked={taxYearConfirmed[selectedDeclaration.declaration_id] === true}
                    onChange={(event) =>
                      setTaxYearConfirmed((current) => ({
                        ...current,
                        [selectedDeclaration.declaration_id]: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    I reviewed the BIR document and confirmed that it declares tax year {selectedDeclaration.tax_year}. The document&apos;s signing or preparation date does not determine the tax year.
                  </span>
                </label>
              )}

              {(selectedDeclaration.status === "pending" || selectedDeclaration.status === "accepted") && (
                <label className="grid gap-2 text-sm font-medium">
                  {selectedDeclaration.status === "pending" ? "Review notes (required)" : "Reason to revoke this accepted declaration (required)"}
                  <Textarea
                    value={notes[selectedDeclaration.declaration_id] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [selectedDeclaration.declaration_id]: event.target.value,
                      }))
                    }
                    maxLength={2000}
                    placeholder="Record the reason for this review action."
                  />
                </label>
              )}

              {selectedDeclaration.status === "accepted" && !revocationAvailable && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                  Revocation history is unavailable until the prepared tax-review migration is applied.
                </p>
              )}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter className="mx-0 mb-0 shrink-0 flex-wrap px-6 py-5">
              <Button
                variant="outline"
                disabled={busy === selectedDeclaration.declaration_id}
                onClick={closeDeclaration}
              >
                Close
              </Button>
              {selectedDeclaration.status === "pending" && (
                <>
                  <Button
                    variant="outline"
                    disabled={!!busy || !notes[selectedDeclaration.declaration_id]?.trim()}
                    onClick={() => void review(selectedDeclaration, "rejected")}
                  >
                    Reject
                  </Button>
                  <Button
                    disabled={
                      !!busy ||
                      !taxYearConfirmed[selectedDeclaration.declaration_id] ||
                      !notes[selectedDeclaration.declaration_id]?.trim()
                    }
                    onClick={() => void review(selectedDeclaration, "accepted")}
                  >
                    {busy === selectedDeclaration.declaration_id ? "Saving…" : "Accept declaration"}
                  </Button>
                </>
              )}
              {selectedDeclaration.status === "accepted" && (
                <Button
                  variant="outline"
                  disabled={
                    !!busy ||
                    !revocationAvailable ||
                    !notes[selectedDeclaration.declaration_id]?.trim()
                  }
                  onClick={() => void review(selectedDeclaration, "revoked")}
                >
                  {busy === selectedDeclaration.declaration_id ? "Saving…" : "Revoke accepted declaration"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}



