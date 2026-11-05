"use client";
import { StyledSelect } from "@/components/ui/styled-select";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { AdminFilterPanel, AdminStatus } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
type ListingFacts = {
  budgetMin?: number | string | null;
  budgetMax?: number | string | null;
  price?: number | string | null;
  deadline?: string | null;
  deliveryDays?: number | null;
};
const PAGE_SIZE = 10;
const STATUSES = ["pending_review", "manual_review", "approved", "rejected"];
const STATUS_FILTERS = ["pending_review", "approved", "rejected"];
const RISKS = ["low", "medium", "high", "critical"];
const isReviewable = (status: string) =>
  status === "pending_review" || status === "manual_review";

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
  const [listingFacts, setListingFacts] = useState<ListingFacts | null>(null);
  const [listingFactsLoading, setListingFactsLoading] = useState(false);
  const [listingFactsError, setListingFactsError] = useState("");
  const [decision, setDecision] = useState<"reject" | null>(null);
  const [category, setCategory] = useState("policy_violation");
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pageError = error.toLowerCase().includes("owner has reached the active listing limit")
    ? ""
    : error;

  useEffect(() => {
    let current = true;
    setListingFacts(null);
    setListingFactsError("");
    if (!selected) {
      setListingFactsLoading(false);
      return;
    }
    const activeSelection = selected;

    async function loadListingFacts() {
      setListingFactsLoading(true);
      if (activeSelection.listing_type === "job") {
        const { data, error: factsError } = await supabase
          .from("jobs")
          .select("budget_min,budget_max,deadline")
          .eq("job_id", activeSelection.listing_id)
          .maybeSingle();
        if (!current) return;
        if (factsError) setListingFactsError("Budget and deadline are unavailable.");
        else if (data)
          setListingFacts({
            budgetMin: data.budget_min,
            budgetMax: data.budget_max,
            deadline: data.deadline,
          });
      } else {
        const { data, error: factsError } = await supabase
          .from("services")
          .select("price,delivery_time_days")
          .eq("service_id", activeSelection.listing_id)
          .maybeSingle();
        if (!current) return;
        if (factsError) setListingFactsError("Price and delivery time are unavailable.");
        else if (data)
          setListingFacts({ price: data.price, deliveryDays: data.delivery_time_days });
      }
      if (current) setListingFactsLoading(false);
    }

    void loadListingFacts();
    return () => {
      current = false;
    };
  }, [selected]);

  function formatPhp(value: number | string | null | undefined) {
    if (value == null || !Number.isFinite(Number(value))) return "Not set";
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 2,
    }).format(Number(value));
  }

  function formatDateOnly(value: string | null | undefined) {
    if (!value) return "Not set";
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString();
  }

  function clearFilters() {
    setSearch("");
    setType("all");
    setRisk("all");
    setStatus("all");
    setFromDate("");
    setToDate("");
    setOffset(0);
    setFiltersOpen(false);
  }

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
    if (status === "pending_review")
      query = query.in("status", ["pending_review", "manual_review"]);
    else if (status !== "all") query = query.eq("status", status);
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

  async function act(action: "approve" | "reject" | null = decision) {
    if (!selected || !action || busy) return;
    if (!isReviewable(selected.status)) {
      setDecision(null);
      setSelected(null);
      await load();
      setError("This submission has already been reviewed.");
      return;
    }
    if (
      action === "reject" &&
      (explanation.trim().length < 12 || category.trim().length < 2)
    ) {
      setError("Choose a category and write a meaningful rejection reason.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("worksync_admin_decide_listing", {
      p_submission: selected.submission_id,
      p_action: action,
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
          { label: "Rejected", value: counts.rejected ?? 0, note: "All rejected submissions" },
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
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="h-10">
                  <SlidersHorizontal className="size-4" />
                  Filters
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-4">
                <div className="grid gap-4">
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
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid min-w-0 gap-1.5 text-sm font-medium">Created from
                      <Input className="h-10 rounded-lg bg-background font-normal" type="date" value={fromDate} max={toDate || undefined} onChange={(event) => { setFromDate(event.target.value); setOffset(0); }} />
                    </label>
                    <label className="grid min-w-0 gap-1.5 text-sm font-medium">Created to
                      <Input className="h-10 rounded-lg bg-background font-normal" type="date" value={toDate} min={fromDate || undefined} onChange={(event) => { setToDate(event.target.value); setOffset(0); }} />
                    </label>
                  </div>
                  <div className="flex justify-end border-t pt-3">
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setType("all"); setRisk("all"); setFromDate(""); setToDate(""); setOffset(0); }}>Clear filters</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button type="button" variant="outline" size="icon" className="h-10" aria-label="Refresh moderation queue" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by review status">
            <button type="button" className={`rounded-full px-3 py-1 text-xs font-medium ${status === "all" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`} aria-pressed={status === "all"} onClick={() => { setStatus("all"); setOffset(0); }}>All submissions</button>
            {STATUS_FILTERS.map((item) => (
              <button key={item} type="button" className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${status === item ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`} aria-pressed={status === item} onClick={() => { setStatus(item); setOffset(0); }}>{item.replaceAll("_", " ")}</button>
            ))}
          </div>
        </div>
      </AdminFilterPanel>
      {pageError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {pageError}
        </p>
      )}
      <Card className="min-w-0 gap-0 rounded-xl border shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
          <div>
            <h2 className="font-semibold">Listing submissions</h2>
            <p className="mt-1 text-sm text-muted-foreground">AI screening results and moderator decisions.</p>
            <Badge variant="outline" className="mt-1 w-fit font-normal">{total.toLocaleString()} matching</Badge>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
              Sort by
              <StyledSelect className="h-9 min-w-36 rounded-lg border bg-background px-3 font-normal text-foreground" value={sort} onChange={(event) => { setSort(event.target.value); setOffset(0); }} aria-label="Sort submissions">
                <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
              </StyledSelect>
            </label>
          </div>
        </div>
        <CardContent className="overflow-x-auto p-4">
          {loading ? (
            <ContentSkeleton label="Loading listing submissions" variant="admin-table" />
          ) : !error && rows.length === 0 ? (
            <div className="space-y-2 border-y px-4 py-12 text-center">
              <p className="font-medium">No submissions found</p>
              <p className="text-sm text-muted-foreground">Try a different search or clear the filters.</p>
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
            </div>
          ) : (
            <div className="rounded-lg border">
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
                    <TableCell>
                      <AdminStatus tone={row.status === "approved" ? "green" : row.status === "rejected" ? "neutral" : "blue"}>
                        {row.status === "approved" ? "Approved" : row.status === "rejected" ? "Rejected" : "Pending"}
                      </AdminStatus>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(row.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      {isReviewable(row.status) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelected(row)}
                        >
                          View details
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">Reviewed</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          {total === 0 ? "0 submissions" : `Showing ${rows.length} of ${total.toLocaleString()} submissions`}
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
      </Card>
      <Dialog
        open={Boolean(selected) && !decision}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl p-0 sm:max-w-2xl">
          <div className="px-5 pt-5 sm:px-6 sm:pt-6">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-lg">{selected?.title}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <Badge variant="secondary" className="px-2 py-0.5">
                  {selected?.listing_type === "job" ? "Job listing" : "Service listing"}
                </Badge>
                <span>Owner: {selected?.owner_id}</span>
                <span aria-hidden="true">·</span>
                <span>{selected && new Date(selected.created_at).toLocaleString()}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 border-t" />

            <section className="space-y-2 pb-4">
              <p className="text-sm font-semibold">Listing Description</p>
              <p className="whitespace-pre-wrap break-words text-sm font-medium">
                {selected?.description || "No description provided."}
              </p>
              <div className="grid gap-x-8 gap-y-2 border-t pt-3 text-sm sm:grid-cols-2">
                {listingFactsLoading ? (
                  <p className="text-muted-foreground">Loading listing details…</p>
                ) : listingFactsError ? (
                  <p className="text-muted-foreground">{listingFactsError}</p>
                ) : selected?.listing_type === "job" ? (
                  <>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Budget</span>
                      <span className="font-medium">
                        {listingFacts?.budgetMin == null && listingFacts?.budgetMax == null
                          ? "Not set"
                          : `${formatPhp(listingFacts?.budgetMin)} – ${formatPhp(listingFacts?.budgetMax)}`}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Deadline</span>
                      <span className="font-medium">{formatDateOnly(listingFacts?.deadline)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Price</span>
                      <span className="font-medium">{formatPhp(listingFacts?.price)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Delivery time</span>
                      <span className="font-medium">
                        {listingFacts?.deliveryDays == null ? "Not set" : `${listingFacts.deliveryDays} days`}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </section>

            <div className="border-t" />

            <section className="space-y-3 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500">
                  <ShieldCheck className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">AI content assessment</h3>
                    <Badge variant="outline" className="capitalize">
                      {selected?.ai_risk ?? "Risk unavailable"} risk
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selected?.ai_explanation ?? selected?.failure_reason ?? "Assessment is queued or awaiting manual review."}
                  </p>
                </div>
              </div>
              {((selected?.ai_categories?.length ?? 0) > 0 || (selected?.ai_evidence?.length ?? 0) > 0) && (
                <div className="space-y-2 pl-12 text-sm">
                  {(selected?.ai_categories?.length ?? 0) > 0 && (
                    <p className="text-muted-foreground">Categories: {selected?.ai_categories?.join(", ")}</p>
                  )}
                  {selected?.ai_evidence?.map((evidence, index) => (
                    <blockquote key={index} className="border-l-2 pl-3 text-muted-foreground">
                      {evidence}
                    </blockquote>
                  ))}
                </div>
              )}
            </section>

            <section className="mb-5 space-y-1 rounded-xl bg-muted/50 p-3.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommended action</p>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
                {selected?.ai_risk === "high" || selected?.ai_risk === "critical" ? "Review listing carefully" : "Approve listing"}
              </p>
              <p className="text-xs text-muted-foreground">
                {selected?.ai_risk === "high" || selected?.ai_risk === "critical"
                  ? "The assessment identified concerns. Review the details before deciding."
                  : "No immediate concerns detected. Admin judgment is still required."}
              </p>
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3 sm:px-6">
            {error && (
              <p role="alert" className="basis-full text-sm text-destructive">
                {error}
              </p>
            )}
            {selected && isReviewable(selected.status) ? (
              <>
                <span className="text-xs text-muted-foreground">Review decision</span>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    className="h-10 min-w-28"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setDecision("reject");
                    }}
                  >
                    Reject
                  </Button>
                  <Button
                    className="h-10 min-w-28"
                    disabled={busy}
                    onClick={() => void act("approve")}
                  >
                    Approve
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">This submission has already been reviewed.</p>
            )}
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
                : "Approve listing"}
            </DialogTitle>
            <DialogDescription>
              Give the owner a clear reason for this decision.
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
