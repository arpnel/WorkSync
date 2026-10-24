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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  rule_results?: string[];
  created_at: string;
};
const PAGE_SIZE = 25;
const STATUSES = ["pending_review", "manual_review", "approved", "rejected"];
const RISKS = ["low", "medium", "high", "critical"];

export default function ModerationPage() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [type, setType] = useState("all");
  const [risk, setRisk] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState("newest");
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
    setError("");
    let query = supabase
      .from("listing_submissions")
      .select(
        "submission_id,listing_type,listing_id,owner_id,title,description,status,ai_risk,ai_explanation,ai_categories,ai_evidence,ai_confidence,failure_reason,rule_results,created_at",
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
    <div className="min-w-0 space-y-7">
      <AdminPageHeader title="Listing moderation" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          [
            "Pending review",
            (counts.pending_review ?? 0) + (counts.manual_review ?? 0),
          ],
          ["Approved", counts.approved ?? 0],
          ["Rejected", counts.rejected ?? 0],
          ["High risk", counts.high_risk ?? 0],
          ["Critical risk", counts.critical_risk ?? 0],
          ["Manual review", counts.manual_review ?? 0],
        ].map(([label, value]) => (
          <Card key={label} className="rounded-xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold tabular-nums">
              {value}
            </CardContent>
          </Card>
        ))}
      </div>
      <AdminFilterPanel ariaLabel="Filter listing submissions">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Input
            className="h-10 rounded-lg bg-background sm:col-span-2 xl:col-span-1"
            aria-label="Search submissions"
            placeholder="Search title or owner ID"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
          />
          <label className="grid gap-1.5 text-sm font-medium">
            Listing type
            <StyledSelect
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setOffset(0);
              }}
            >
              <option value="all">All types</option>
              <option value="job">Jobs</option>
              <option value="service">Services</option>
            </StyledSelect>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Risk
            <StyledSelect
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              value={risk}
              onChange={(event) => {
                setRisk(event.target.value);
                setOffset(0);
              }}
            >
              <option value="all">All risks</option>
              {RISKS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </StyledSelect>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Status
            <StyledSelect
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setOffset(0);
              }}
            >
              <option value="all">All statuses</option>
              {STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </StyledSelect>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            From
            <Input
              className="h-10 rounded-lg bg-background font-normal"
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                setOffset(0);
              }}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Through
            <Input
              className="h-10 rounded-lg bg-background font-normal"
              type="date"
              value={toDate}
              onChange={(event) => {
                setToDate(event.target.value);
                setOffset(0);
              }}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Sort by
            <StyledSelect
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </StyledSelect>
          </label>
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
      <section className="space-y-3" aria-label="Listing submissions">
        {rows.map((row) => (
          <Card key={row.submission_id} className="rounded-xl shadow-sm">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <button
                className="min-w-0 text-left focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() => setSelected(row)}
              >
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="break-words">{row.title}</span>
                  <Badge variant="outline">{row.listing_type}</Badge>
                  <Badge variant="secondary">
                    {row.ai_risk ?? "assessment pending"}
                  </Badge>
                  <Badge>{row.status.replaceAll("_", " ")}</Badge>
                </span>
                <span className="mt-2 block break-all text-xs text-muted-foreground">
                  Owner {row.owner_id} ·{" "}
                  {new Date(row.created_at).toLocaleString()}
                </span>
              </button>
              <div className="flex flex-wrap gap-2 sm:shrink-0">
                <Button
                  className="min-h-10 rounded-lg"
                  variant="outline"
                  onClick={() => {
                    setSelected(row);
                    setDecision("flag");
                  }}
                >
                  Flag
                </Button>
                <Button
                  className="min-h-10 rounded-lg"
                  variant="outline"
                  onClick={() => {
                    setSelected(row);
                    setDecision("reject");
                  }}
                >
                  Reject
                </Button>
                <Button
                  className="min-h-10 rounded-lg"
                  onClick={() => {
                    setSelected(row);
                    setDecision("approve");
                  }}
                >
                  Approve
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed bg-card px-4 py-12 text-center text-sm text-muted-foreground">
            No submissions match these filters.
          </div>
        )}
      </section>
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
            {(selected?.rule_results?.length ?? 0) > 0 && (
              <section className="space-y-2 rounded-xl border bg-background p-4">
                <p className="font-semibold">Rule-based checks</p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {selected?.rule_results?.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            )}
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
