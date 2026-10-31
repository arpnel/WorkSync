"use client";
import { StyledSelect } from "@/components/ui/styled-select";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { AdminFilterPanel } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Submission = {
  submission_id: string;
  listing_type: "job" | "service";
  listing_id: string;
  owner_id: string;
  title: string;
  description: string;
  status: string;
  ai_risk: string | null;
  ai_explanation: string | null;
  ai_categories: string[];
  ai_evidence: string[];
  ai_confidence: number | null;
  failure_reason: string | null;
  owner_removed_at: string | null;
  created_at: string;
};
const PAGE_SIZE = 10;
const STATUSES = ["pending_review", "manual_review", "approved", "rejected"];
const RISKS = ["low", "medium", "high", "critical"];

export default function ModerationPage() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [type, setType] = useState("all");
  const [risk, setRisk] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [decision, setDecision] = useState<
    "approve" | "reject" | "flag" | null
  >(null);
  const [category, setCategory] = useState("policy_violation");
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = supabase
      .from("listing_submissions")
      .select(
        "submission_id,listing_type,listing_id,owner_id,title,description,status,ai_risk,ai_explanation,ai_categories,ai_evidence,ai_confidence,failure_reason,created_at,owner_removed_at",
        { count: "exact" },
      )
      .neq("status", "editing")
      .order("created_at", { ascending: sort === "oldest" })
      .range(offset, offset + PAGE_SIZE - 1);
    if (type !== "all") query = query.eq("listing_type", type);
    if (risk !== "all") query = query.eq("ai_risk", risk);
    if (status !== "all") query = query.eq("status", status);
    if (fromDate)
      query = query.gte(
        "created_at",
        new Date(`${fromDate}T00:00:00`).toISOString(),
      );
    if (toDate)
      query = query.lt(
        "created_at",
        new Date(
          new Date(`${toDate}T00:00:00`).getTime() + 86400000,
        ).toISOString(),
      );
    if (search.trim())
      query = /^[0-9a-f-]{36}$/i.test(search.trim())
        ? query.or(
            `title.ilike.%${search.trim()}%,owner_id.eq.${search.trim()}`,
          )
        : query.ilike("title", `%${search.trim().replace(/[,%()]/g, " ")}%`);
    const { data, error, count } = await query;
    if (error) {
      setError(error.message);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as Submission[]);
    setTotal(count ?? 0);
    const names = ["pending_review", "manual_review", "approved", "rejected"];
    const results = await Promise.all(
      names.map((name) =>
        supabase
          .from("listing_submissions")
          .select("submission_id", { count: "exact", head: true })
          .eq("status", name),
      ),
    );
    const [high, critical] = await Promise.all(
      ["high", "critical"].map((value) =>
        supabase
          .from("listing_submissions")
          .select("submission_id", { count: "exact", head: true })
          .eq("ai_risk", value),
      ),
    );
    setCounts({
      ...Object.fromEntries(
        names.map((name, i) => [name, results[i].count ?? 0]),
      ),
      high_risk: high.count ?? 0,
      critical_risk: critical.count ?? 0,
    });
    setLoading(false);
  }, [type, risk, status, search, fromDate, toDate, sort, offset]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 180);
    return () => clearTimeout(timer);
  }, [load]);

  async function act() {
    if (!selected || !decision || busy) return;
    if (
      decision === "reject" &&
      (explanation.trim().length < 12 || category.trim().length < 2)
    ) {
      setError("Choose a category and write a meaningful rejection reason.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("worksync_admin_decide_listing", {
      p_submission: selected.submission_id,
      p_action: decision,
      p_category: category.trim(),
      p_explanation: explanation.trim(),
    });
    if (error) setError(error.message);
    else {
      setDecision(null);
      setSelected(null);
      setExplanation("");
      await load();
    }
    setBusy(false);
  }

  return (
    <div className="min-w-0 space-y-4">
      <AdminPageHeader title="Listing moderation" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total submissions", value: total, note: "Matching filters" },
          { label: "Pending review", value: (counts.pending_review ?? 0) + (counts.manual_review ?? 0), note: "Across the review queue" },
          { label: "Approved", value: counts.approved ?? 0, note: "All reviewed submissions" },
          { label: "High risk", value: (counts.high_risk ?? 0) + (counts.critical_risk ?? 0), note: "High and critical risk" },
        ].map(({ label, value, note }) => (
          <Card key={label} className="gap-1 rounded-xl border p-3 shadow-none">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tabular-nums">{value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{note}</p>
          </Card>
        ))}
      </div>
      <AdminFilterPanel ariaLabel="Filter listing submissions">
        <div className="space-y-3">
          <div className="flex gap-2">
            <label className="relative block min-w-0 flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                className="h-10 w-full rounded-lg bg-background pl-10 font-normal"
                aria-label="Search submissions"
                placeholder="Listing title or owner ID"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOffset(0);
                }}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={filtersOpen ? "Hide filters" : "Show filters"}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal className="size-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by review status">
            <button type="button" className={`rounded-full px-3 py-1 text-xs font-medium ${status === "all" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`} aria-pressed={status === "all"} onClick={() => { setStatus("all"); setOffset(0); }}>All submissions</button>
            {STATUSES.map((item) => (
              <button key={item} type="button" className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${status === item ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`} aria-pressed={status === item} onClick={() => { setStatus(item); setOffset(0); }}>{item.replaceAll("_", " ")}</button>
            ))}
          </div>
          {filtersOpen && (
            <div className="grid gap-3 border-t pt-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="grid gap-1.5 text-sm font-medium">Listing type
                <StyledSelect className="h-10 w-full rounded-lg border bg-background px-3 font-normal" value={type} onChange={(event) => { setType(event.target.value); setOffset(0); }}>
                  <option value="all">All types</option><option value="job">Jobs</option><option value="service">Services</option>
                </StyledSelect>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">Risk
                <StyledSelect className="h-10 w-full rounded-lg border bg-background px-3 font-normal" value={risk} onChange={(event) => { setRisk(event.target.value); setOffset(0); }}>
                  <option value="all">All risks</option>{RISKS.map((item) => <option key={item} value={item}>{item}</option>)}
                </StyledSelect>
              </label>
              <label className="grid min-w-0 gap-1.5 text-sm font-medium">Created from
                <Input className="h-10 rounded-lg bg-background font-normal" type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setOffset(0); }} />
              </label>
              <label className="grid min-w-0 gap-1.5 text-sm font-medium">Created to
                <Input className="h-10 rounded-lg bg-background font-normal" type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); setOffset(0); }} />
              </label>
            </div>
          )}
        </div>
      </AdminFilterPanel>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Card className="min-w-0 gap-0 rounded-xl border shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
          <div>
            <h2 className="font-semibold">Listing submissions</h2>
            <p className="mt-1 text-sm text-muted-foreground">AI screening results and moderator decisions.</p>
            <Badge variant="outline" className="mt-1 w-fit font-normal">{total.toLocaleString()} submissions</Badge>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
              Sort by
              <StyledSelect className="h-9 min-w-36 rounded-lg border bg-background px-3 font-normal text-foreground" value={sort} onChange={(event) => { setSort(event.target.value); setOffset(0); }} aria-label="Sort submissions">
                <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
              </StyledSelect>
            </label>
            <Button type="button" variant="outline" size="icon" aria-label="Refresh moderation queue" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            </Button>
          </div>
        </div>
        <CardContent className="overflow-x-auto p-4">
          {loading ? (
            <ContentSkeleton label="Loading listing submissions" variant="table" />
          ) : (
            <Table className="min-w-[1120px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Listing / reference</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Review actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.submission_id}>
                    <TableCell className="max-w-sm">
                      <button className="text-left font-medium hover:underline" onClick={() => setSelected(row)}>{row.title}</button>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{row.submission_id}</p>
                      {row.owner_removed_at && <Badge variant="outline" className="mt-1">Removed from owner view</Badge>}
                    </TableCell>
                    <TableCell className="capitalize">{row.listing_type}</TableCell>
                    <TableCell className="font-mono text-xs">{row.owner_id.slice(0, 8)}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{row.ai_risk ?? "assessment pending"}</Badge></TableCell>
                    <TableCell><Badge className="capitalize">{row.status.replaceAll("_", " ")}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(row.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setSelected(row); setDecision("flag"); }}>Flag</Button>
                        <Button size="sm" variant="outline" onClick={() => { setSelected(row); setDecision("reject"); }}>Reject</Button>
                        <Button size="sm" onClick={() => { setSelected(row); setDecision("approve"); }}>Approve</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && !error && rows.length === 0 && (
            <div className="rounded-xl border border-dashed bg-card px-4 py-12 text-center text-sm text-muted-foreground">No submissions match these filters.</div>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          {total} submissions · page {Math.floor(offset / PAGE_SIZE) + 1}
        </span>
        <div className="flex gap-2">
          <Button
            className="min-h-10 rounded-lg"
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </Button>
          <Button
            className="min-h-10 rounded-lg"
            variant="outline"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      </div>
      <Dialog
        open={Boolean(selected) && !decision}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>
              {selected?.listing_type} · Owner {selected?.owner_id} ·{" "}
              {selected && new Date(selected.created_at).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="whitespace-pre-wrap break-words">
              {selected?.description}
            </p>
            <section className="space-y-2 rounded-xl border bg-muted/30 p-4">
              <p className="font-semibold">
                AI assessment: {selected?.ai_risk ?? "Not available"}
              </p>
              <p className="text-muted-foreground">
                {selected?.ai_explanation ??
                  selected?.failure_reason ??
                  "Assessment is queued or awaiting manual review."}
              </p>
              {(selected?.ai_categories?.length ?? 0) > 0 && (
                <p>Categories: {selected?.ai_categories?.join(", ")}</p>
              )}
              {selected?.ai_evidence?.map((evidence, index) => (
                <blockquote
                  key={index}
                  className="border-l-2 pl-3 text-muted-foreground"
                >
                  {evidence}
                </blockquote>
              ))}
            </section>
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button onClick={() => setDecision("approve")}>Approve</Button>
              <Button variant="outline" onClick={() => setDecision("flag")}>
                Flag for review
              </Button>
              <Button
                variant="destructive"
                onClick={() => setDecision("reject")}
              >
                Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(decision)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDecision(null);
            setError("");
          }
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-2xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {decision === "reject"
                ? "Reject listing"
                : decision === "flag"
                  ? "Flag for review"
                  : "Approve listing"}
            </DialogTitle>
            <DialogDescription>
              {decision === "reject"
                ? "Give the owner a clear reason for this decision."
                : "Record this moderation decision."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              Reason category
              <StyledSelect
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {[
                  "spam",
                  "duplicate_abuse",
                  "misleading_information",
                  "prohibited_content",
                  "harassment",
                  "suspicious_transaction",
                  "other",
                  "policy_violation",
                ].map((item) => (
                  <option key={item} value={item}>
                    {item.replaceAll("_", " ")}
                  </option>
                ))}
              </StyledSelect>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Explanation
              <Textarea
                className="font-normal"
                minLength={decision === "reject" ? 12 : 0}
                maxLength={1200}
                value={explanation}
                onChange={(event) => setExplanation(event.target.value)}
                placeholder="Describe the decision and next steps"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              className="h-11 w-full rounded-lg"
              disabled={
                busy ||
                (decision === "reject" && explanation.trim().length < 12)
              }
              onClick={() => void act()}
            >
              {busy ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
