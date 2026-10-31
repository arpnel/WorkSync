"use client";
import { StyledSelect } from "@/components/ui/styled-select";

import { ADMIN_PAGE_GUIDANCE } from "./admin-page-guidance";
import AdminMetricCard from "./AdminMetricCard";
import AdminStatusChart from "./AdminStatusChart";
import { filterAdminPage } from "@/services/admin/adminRecordFilters";
import AdminPageHeader from "./AdminPageHeader";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { openSavedTaxReceipt } from "@/lib/payments/receiptClient";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DisputeContext from "./DisputeContext";
import { Button } from "@/components/ui/button";
import AdminDocumentLink from "@/components/admin/AdminDocumentLink";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AdminFilterPanel } from "@/components/admin/admin-ui";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  getAdminRecords,
  reviewAdminRecord,
  type AdminModule,
  type AdminResult,
  type AdminRow,
} from "@/services/admin/adminService";

function jobBudget(detail: string) {
  const match = detail.match(/Budget:\s*PHP\s*([\d,.]+)\s*-\s*([\d,.]+)/i);
  if (!match) return "Not recorded";
  const format = (value: string) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(Number(value.replaceAll(",", "")));
  return `${format(match[1])} – ${format(match[2])}`;
}

function servicePrice(detail: string) {
  const match = detail.match(/Price:\s*PHP\s*([\d,.]+)/i);
  if (!match) return "Not recorded";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(match[1].replaceAll(",", "")));
}

function projectDetailValue(detail: string, label: string) {
  return detail.match(new RegExp(`^${label}:\\s*(.+)$`, "im"))?.[1]?.trim() ?? "Not recorded";
}

function projectBudget(detail: string) {
  const value = projectDetailValue(detail, "Budget").replace(/^PHP\s*/i, "");
  const amount = Number(value.replaceAll(",", ""));
  if (!Number.isFinite(amount)) return "Not recorded";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function AdminRecords({
  module,
  title,
}: {
  module: AdminModule;
  title: string;
}) {
  const [data, setData] = useState<AdminResult | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState("newest");
  const [jobFiltersOpen, setJobFiltersOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [previousOffsets, setPreviousOffsets] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminRow | null>(null);
  const [expires, setExpires] = useState("");
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await getAdminRecords(module, search, offset);
      if (request === sequence.current) setData(result);
    } catch (cause) {
      if (request === sequence.current) {
        setData(null);
        setError(
          cause instanceof Error ? cause.message : "Unable to load records.",
        );
      }
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [module, search, offset]);
  useEffect(() => {
    const requests = sequence;
    const timer = setTimeout(() => void load(), 200);
    return () => {
      clearTimeout(timer);
      requests.current++;
    };
  }, [load]);
  const actions =
    module === "users"
      ? ["suspend", "restore"]
      : module === "disputes"
        ? ["under_review", "resume_work", "cancel_project"]
        : module === "reports"
          ? ["under_review", "resolved", "dismissed"]
          : module === "verification"
            ? ["approved", "rejected"]
            : module === "services" || module === "jobs"
              ? ["hide", "restore"]
              : [];
  const visibleRows = filterAdminPage(
    data?.rows ?? [],
    statusFilter,
    fromDate,
    toDate,
    sort,
  );
  const statusCounts = (data?.rows ?? []).reduce<Record<string, number>>(
    (counts, row) => {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const isModerationRecordModule = module === "reports" || module === "disputes";
  const isUserModule = module === "users";
  const isAuditModule = module === "audit";
  const isVerificationModule = module === "verification";
  const isStructuredRecordsModule =
    module === "jobs" ||
    module === "services" ||
    module === "projects" ||
    isModerationRecordModule || isUserModule || isAuditModule || isVerificationModule;
  const listingStatuses = [
    ...new Set([
      ...(module === "jobs"
        ? ["open", "closed", "in_progress", "completed", "disputed", "hidden"]
        : module === "services"
          ? ["active", "hidden", "draft", "paused"]
          : module === "projects"
            ? ["active", "in_progress", "completed", "cancelled"]
            : module === "reports"
              ? ["pending", "under_review", "resolved", "dismissed"]
              : module === "disputes" ? ["open", "under_review", "resolved", "closed"] : module === "users" ? ["active", "suspended"] : module === "verification" ? ["pending", "under_review", "approved", "rejected"] : []),
      ...(data?.rows ?? []).map((row) => row.status),
    ]),
  ];
  const listingTotal = data?.total ?? data?.rows.length ?? 0;
  const loadedPageLabel =
    data?.total == null ? "Loaded page only" : "All records";
  const isListingModule = ["jobs", "services", "projects"].includes(module);
  const reviewMetric =
    module === "jobs"
      ? statusCounts.open ?? 0
      : module === "services"
        ? statusCounts.active ?? 0
        : module === "projects"
          ? (statusCounts.active ?? 0) + (statusCounts.in_progress ?? 0)
          : module === "reports"
            ? (statusCounts.pending ?? 0) +
              (statusCounts.pending_review ?? 0) +
              (statusCounts.manual_review ?? 0)
            : module === "disputes"
              ? (statusCounts.open ?? 0) + (statusCounts.pending ?? 0)
              : statusCounts.active ?? 0;
  const closedMetric =
    module === "jobs"
      ? statusCounts.in_progress ?? 0
      : module === "services"
        ? statusCounts.hidden ?? 0
        : module === "projects"
          ? statusCounts.completed ?? 0
          : module === "reports"
            ? (statusCounts.resolved ?? 0) + (statusCounts.dismissed ?? 0)
            : module === "disputes"
              ? (statusCounts.resolved ?? 0) +
                (statusCounts.closed ?? 0) +
                (statusCounts.completed ?? 0) +
                (statusCounts.cancelled ?? 0)
              : statusCounts.suspended ?? 0;
  // Only observed months from this loaded page; never claim platform-wide history.
  const monthCounts = (data?.rows ?? []).reduce<Record<string, number>>(
    (counts, row) => {
      const date = new Date(row.created_at);
      if (Number.isFinite(date.getTime())) {
        const month =
          date.getFullYear() +
          "-" +
          String(date.getMonth() + 1).padStart(2, "0");
        counts[month] = (counts[month] ?? 0) + 1;
      }
      return counts;
    },
    {},
  );
  const timeline = Object.fromEntries(
    Object.entries(monthCounts).sort(([a], [b]) => a.localeCompare(b)),
  );
  return (
    <div className={isStructuredRecordsModule ? "min-w-0 space-y-4" : "min-w-0 space-y-6"}>
      <AdminPageHeader title={title} />
      {isStructuredRecordsModule && (
        <section
          aria-label={`${module === "jobs" ? "Job" : module === "services" ? "Service" : module === "projects" ? "Project" : module === "reports" ? "Report" : module === "disputes" ? "Dispute" : module === "audit" ? "Audit" : module === "verification" ? "Verification" : "User"} summary`}
          className={`grid gap-3 ${isModerationRecordModule || isUserModule ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"}`}
        >
          <Card className="gap-1 rounded-xl border p-3 shadow-none">
            <p className="text-xs text-muted-foreground">
              {module === "jobs"
                ? "Total jobs"
                : module === "services"
                  ? "Total services"
                  : module === "projects"
                    ? "Total projects"
                    : module === "reports"
                      ? "Total reports"
                      : module === "disputes" ? "Total disputes" : module === "audit" ? "Audit entries" : module === "verification" ? "Verification requests" : "Total users"}
            </p>
            <p className="text-xl font-semibold tabular-nums">
              {listingTotal.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">{loadedPageLabel}</p>
          </Card>
          <Card className="gap-1 rounded-xl border p-3 shadow-none">
            <p className="text-xs text-muted-foreground">
              {module === "jobs"
                ? "Open"
                : module === "services"
                  ? "Active"
                  : module === "projects"
                    ? "Active"
                    : module === "reports"
                      ? "Pending review"
                      : module === "disputes" ? "Open" : module === "audit" ? "Event types" : module === "verification" ? "Pending review" : "Active"}
            </p>
            <p className="text-xl font-semibold tabular-nums">
              {isAuditModule ? Object.keys(statusCounts).length.toLocaleString() : isVerificationModule ? ((statusCounts.pending ?? 0) + (statusCounts.under_review ?? 0)).toLocaleString() : reviewMetric.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">On the loaded page</p>
          </Card>
          <Card className="gap-1 rounded-xl border p-3 shadow-none">
            <p className="text-xs text-muted-foreground">
              {module === "jobs"
                ? "In progress"
                : module === "services"
                  ? "Hidden"
                  : module === "projects"
                    ? "Completed"
                    : module === "reports"
                      ? "Resolved / dismissed"
                      : module === "disputes" ? "Resolved / closed" : module === "audit" ? "Actors on loaded page" : module === "verification" ? "Approved / rejected" : "Suspended"}
            </p>
            <p className="text-xl font-semibold tabular-nums">
              {isAuditModule ? new Set((data?.rows ?? []).map((row) => row.owner_id).filter(Boolean)).size.toLocaleString() : isVerificationModule ? ((statusCounts.approved ?? 0) + (statusCounts.rejected ?? 0)).toLocaleString() : closedMetric.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">On the loaded page</p>
          </Card>
          {isModerationRecordModule && (
            <Card className="gap-1 rounded-xl border p-3 shadow-none">
              <p className="text-xs text-muted-foreground">Under review</p>
              <p className="text-xl font-semibold tabular-nums">
                {(statusCounts.under_review ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">On the loaded page</p>
            </Card>
          )}
        </section>
      )}
      {!isStructuredRecordsModule && (
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4 sm:flex-row sm:items-center">
          <div className="max-w-3xl">
            <h2 className="text-sm font-semibold">
              {ADMIN_PAGE_GUIDANCE[module].title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {ADMIN_PAGE_GUIDANCE[module].description}
            </p>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href={ADMIN_PAGE_GUIDANCE[module].href}>
              {ADMIN_PAGE_GUIDANCE[module].link}
            </Link>
          </Button>
        </div>
      )}
      {!isStructuredRecordsModule && data?.stats ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
          {Object.entries(data.stats).map(([label, value], index) => (
            <AdminMetricCard
              key={label}
              label={label}
              value={value}
              index={index}
            />
          ))}
        </div>
      ) : null}
      <AdminFilterPanel ariaLabel="Filter records">
        {isStructuredRecordsModule ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <label className="relative block min-w-0 flex-1">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
                />
                <Input
                  className="h-10 w-full rounded-lg bg-background pl-10 font-normal"
                  aria-label={
                    module === "jobs"
                      ? "Search jobs"
                      : module === "services"
                        ? "Search services"
                        : module === "projects"
                          ? "Search projects"
                          : module === "reports"
                            ? "Search reports"
                            : module === "disputes" ? "Search disputes" : module === "audit" ? "Search audit entries" : module === "verification" ? "Search verification requests" : "Search users"
                  }
                  placeholder={
                    module === "jobs"
                      ? "Search job titles, statuses, or references..."
                      : module === "services"
                        ? "Search service titles, statuses, or references..."
                        : module === "projects"
                          ? "Search project titles, statuses, or references..."
                          : module === "reports"
                            ? "Search report titles, statuses, or references..."
                            : module === "disputes"
                              ? "Search disputes, projects, or references..."
                              : module === "audit" ? "Search actions, administrators, or references..." : module === "verification" ? "Search documents, freelancers, or references..." : "Search users by name, email, or ID..."
                  }
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setOffset(0);
                    setPreviousOffsets([]);
                  }}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={jobFiltersOpen ? "Hide filters" : "Show filters"}
                aria-expanded={jobFiltersOpen}
                onClick={() => setJobFiltersOpen((open) => !open)}
              >
                <SlidersHorizontal className="size-4" />
              </Button>
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={`Filter by ${module === "jobs" ? "job" : module === "services" ? "service" : module === "projects" ? "project" : module === "reports" ? "report" : "dispute"} status`}
            >
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-medium ${statusFilter === "all" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                aria-pressed={statusFilter === "all"}
                onClick={() => setStatusFilter("all")}
              >
                {module === "jobs"
                  ? "All jobs"
                  : module === "services"
                    ? "All services"
                    : module === "projects"
                      ? "All projects"
                      : module === "reports"
                        ? "All reports"
                        : module === "disputes" ? "All disputes" : module === "audit" ? "All entries" : module === "verification" ? "All requests" : "All users"}
              </button>
              {listingStatuses.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusFilter === value ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  aria-pressed={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                >
                  {value.replaceAll("_", " ")}
                </button>
              ))}
            </div>
            {jobFiltersOpen && (
              <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1.5 text-sm font-medium">
                  Created from
                  <Input
                    className="h-10 w-full rounded-lg bg-background font-normal"
                    type="date"
                    value={fromDate}
                    max={toDate || undefined}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </label>
                <label className="grid min-w-0 gap-1.5 text-sm font-medium">
                  Created to
                  <Input
                    className="h-10 w-full rounded-lg bg-background font-normal"
                    type="date"
                    value={toDate}
                    min={fromDate || undefined}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </label>
              </div>
            )}
          </div>
        ) : (
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {module !== "overview" && (
            <label className="grid min-w-0 gap-1.5 text-sm font-medium sm:col-span-2 xl:col-span-2">
              Search records
              <span className="relative block">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
                />
                <Input
                  className="h-10 w-full rounded-lg bg-background pl-10 font-normal"
                  aria-label="Search records"
                  placeholder="Name, email, ID, or reference"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setOffset(0);
                    setPreviousOffsets([]);
                  }}
                />
              </span>
            </label>
          )}
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            Status
            <StyledSelect
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {Array.from(
                new Set(["all", statusFilter, ...Object.keys(statusCounts)]),
              ).map((value) => (
                <option key={value} value={value}>
                  {value === "all"
                    ? "All statuses"
                    : value.replaceAll("_", " ")}
                </option>
              ))}
            </StyledSelect>
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            Created from
            <Input
              className="h-10 w-full rounded-lg bg-background font-normal"
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            Created through
            <Input
              className="h-10 w-full rounded-lg bg-background font-normal"
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            Sort by
            <StyledSelect
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name order</option>
            </StyledSelect>
          </label>
          <div className="flex w-full flex-col gap-2 sm:col-span-2 sm:flex-row sm:justify-end xl:col-span-full">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full rounded-lg sm:w-auto"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw
                className={loading ? "size-4 animate-spin" : "size-4"}
              />
              Refresh
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-full rounded-lg sm:w-auto"
              onClick={() => {
                setStatusFilter("all");
                setFromDate("");
                setToDate("");
                setSort("newest");
                setSearch("");
                setOffset(0);
                setPreviousOffsets([]);
              }}
            >
              Reset filters
            </Button>
          </div>
        </div>
        )}
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {isStructuredRecordsModule
            ? `Search checks ${module === "jobs" ? "job" : module === "services" ? "service" : module === "projects" ? "project" : module === "reports" ? "report" : "dispute"} titles, statuses, and references. Status, dates, and sorting apply to the loaded page.`
            : "Search checks all records. Status, dates, and sorting apply to the loaded page."}
        </p>
      </AdminFilterPanel>
      {!loading &&
        data &&
        (isStructuredRecordsModule ? null : module === "overview" ? (
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <AdminStatusChart
              title="Platform overview"
              description="Current platform totals. Categories may overlap."
              counts={data.stats ?? {}}
              variant="bar"
            />
            <AdminStatusChart
              title="Recent moderation activity"
              description="Records by month on this loaded page only; not complete monthly totals."
              counts={timeline}
              variant="line"
            />
          </div>
        ) : (
          <AdminStatusChart
            title={
              module === "transactions"
                ? "Records over time"
                : "Status breakdown"
            }
            description="Loaded page only, before page filters."
            counts={
              module === "transactions"
                ? timeline
                : statusCounts
            }
            variant={
              module === "transactions"
                ? "line"
                : module === "verification" || module === "users"
                  ? "donut"
                  : module === "disputes" || module === "reports"
                    ? "pie"
                    : "bar"
            }
          />
        ))}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
          <Button variant="ghost" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}
      {feedback && (
        <p role="status" className="text-sm">
          {feedback}
        </p>
      )}
      <Card
        className={
          isStructuredRecordsModule
            ? "min-w-0 gap-0 rounded-xl border shadow-none"
            : undefined
        }
      >
        {isStructuredRecordsModule ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
            <div>
              <h2 className="font-semibold">
                {module === "jobs"
                  ? "Job records"
                  : module === "services"
                    ? "Service records"
                    : module === "projects"
                      ? "Project records"
                      : module === "reports"
                        ? "Report records"
                          : module === "disputes" ? "Dispute records" : module === "audit" ? "Audit entries" : module === "verification" ? "Verification requests" : "User records"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {module === "jobs"
                  ? "Job listings and their current moderation status."
                  : module === "services"
                    ? "Freelancer services and their current moderation status."
                    : module === "projects"
                      ? "Projects, budgets, participants, and delivery status."
                      : module === "reports"
                        ? "Reported listings and their review status."
                        : module === "disputes" ? "Project disputes and their resolution status." : module === "audit" ? "Administrative actions recorded for review." : module === "verification" ? "Freelancer identity and tax documents awaiting review." : "Accounts and their current access status."}
              </p>
              {data && (
                <Badge variant="outline" className="mt-1 w-fit font-normal">
                  {listingTotal.toLocaleString()} {listingTotal === 1 ? "record" : "records"}
                  {data.total == null ? " loaded" : ""}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
                Sort by
                <StyledSelect
                  className="h-9 min-w-36 rounded-lg border bg-background px-3 font-normal text-foreground"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  aria-label={`Sort ${module}`}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Name order</option>
                </StyledSelect>
              </label>
            </div>
          </div>
        ) : (
          <CardHeader>
            <CardTitle className="text-base">
              {module === "overview" ? "Recent moderation activity" : "Records"}
            </CardTitle>
          </CardHeader>
        )}
        <CardContent
          className={
            isStructuredRecordsModule
              ? "overflow-x-auto p-4"
              : "overflow-x-auto"
          }
        >
          {loading ? (
            <ContentSkeleton label="Loading records" variant="table" />
          ) : isStructuredRecordsModule ? (
            <Table className={module === "projects" ? "min-w-[1120px]" : "min-w-[900px]"}>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {module === "jobs"
                      ? "Job / reference"
                      : module === "services"
                        ? "Service / reference"
                        : module === "projects"
                          ? "Project / reference"
                          : module === "reports"
                            ? "Report / reference"
                            : module === "disputes" ? "Dispute / project" : module === "audit" ? "Event / reference" : module === "verification" ? "Document / reference" : "User / reference"}
                  </TableHead>
                  <TableHead>
                    {module === "jobs"
                      ? "Client account"
                      : module === "services"
                        ? "Freelancer account"
                        : module === "projects"
                          ? "Participants"
                          : module === "reports"
                            ? "Listing owner"
                            : module === "disputes" ? "Opened by" : module === "audit" ? "Administrator" : module === "verification" ? "Freelancer" : "Role / email"}
                  </TableHead>
                  {isListingModule && (
                    <TableHead>
                      {module === "jobs"
                        ? "Budget"
                        : module === "services"
                          ? "Price"
                          : "Budget"}
                    </TableHead>
                  )}
                  {module === "projects" && <TableHead>Deadline</TableHead>}
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-sm">
                      <p className="truncate font-medium">{row.title}</p>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {row.id}
                      </p>
                    </TableCell>
                    <TableCell className="font-medium">
                      {module === "projects" ? (
                        <div className="space-y-1 text-xs">
                          <p>Client: {projectDetailValue(row.detail, "Client profile")}</p>
                          <p>Freelancer: {projectDetailValue(row.detail, "Freelancer profile")}</p>
                        </div>
                      ) : isUserModule ? (
                        <div className="space-y-1 text-xs">
                          <p>{projectDetailValue(row.detail, "Role")}</p>
                          <p className="text-muted-foreground">{projectDetailValue(row.detail, "Email")}</p>
                        </div>
                      ) : row.owner_id ? (
                        `ID ${row.owner_id.slice(0, 8)}`
                      ) : isAuditModule ? projectDetailValue(row.detail, "Administrator") : (
                        "Not available"
                      )}
                    </TableCell>
                    {isListingModule && (
                      <TableCell className="whitespace-nowrap font-medium">
                        {module === "jobs"
                          ? jobBudget(row.detail)
                          : module === "services"
                            ? servicePrice(row.detail)
                            : projectBudget(row.detail)}
                      </TableCell>
                    )}
                    {module === "projects" && (
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {projectDetailValue(row.detail, "Deadline")}
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {row.created_at
                        ? new Date(row.created_at).toLocaleDateString()
                        : "Not recorded"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`rounded-full font-medium capitalize ${["open", "active", "in_progress"].includes(row.status) ? "bg-blue-500/15 text-blue-500" : ""}`}
                      >
                        {row.status.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelected(row);
                          setExpires("");
                          setNotes("");
                          setAction(actions[0] ?? "");
                        }}
                      >
                        View details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table className={module === "jobs" ? "min-w-[720px]" : undefined}>
              <TableHeader className="hidden md:table-header-group">
                <TableRow>
                  <TableHead>
                    {module === "jobs" ? "Job / reference" : "Name / reference"}
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  {module === "transactions" && <TableHead>Receipt</TableHead>}
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="grid grid-cols-2 gap-2 py-4 md:table-row md:py-0"
                  >
                    <TableCell className="col-span-2 whitespace-normal break-words font-medium md:max-w-sm">
                      {row.title}
                    </TableCell>
                    <TableCell className="capitalize">
                      <Badge
                        variant="secondary"
                        className="rounded-full font-medium"
                      >
                        {row.status.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground md:text-left md:text-sm">
                      {row.created_at
                        ? new Date(row.created_at).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    {module === "transactions" && (
                      <TableCell className="col-span-2 md:text-left">
                        {row.status.toLowerCase() === "paid" ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                void openSavedTaxReceipt(row.id).catch(
                                  (cause) =>
                                    setError(
                                      cause instanceof Error
                                        ? cause.message
                                        : "Receipt unavailable.",
                                    ),
                                )
                              }
                            >
                              View
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Available after payment is confirmed
                          </span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="col-span-2 md:text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelected(row);
                          setExpires("");
                          setNotes("");
                          setAction(actions[0] ?? "");
                        }}
                      >
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && !error && !!data && visibleRows.length === 0 && (
            <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
              No records match this selection. Reset page filters or try another
              page.
            </p>
          )}
          {module !== "overview" && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Button
                variant="outline"
                disabled={loading || previousOffsets.length === 0}
                onClick={() => {
                  setOffset(previousOffsets[previousOffsets.length - 1] ?? 0);
                  setPreviousOffsets(previousOffsets.slice(0, -1));
                }}
              >
                Previous
              </Button>
              <span className="text-sm">
                {isStructuredRecordsModule && data?.total != null
                  ? statusFilter === "all" && !fromDate && !toDate
                    ? `Showing ${data.rows.length ? data.offset + 1 : 0}–${data.offset + data.rows.length} of ${data.total.toLocaleString()}`
                    : `Showing ${visibleRows.length} of ${data.rows.length} loaded · ${data.total.toLocaleString()} total`
                  : `Page ${previousOffsets.length + 1}: ${data?.rows.length ?? 0} records loaded; ${visibleRows.length} shown`}
              </span>
              <Button
                variant="outline"
                disabled={loading || !data?.hasNext}
                onClick={() => {
                  if (!data) return;
                  setPreviousOffsets([...previousOffsets, offset]);
                  setOffset(data.offset + data.limit);
                }}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>Reference: {selected?.id}</DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words text-sm">
            {selected?.detail}
          </p>
          {module === "disputes" && selected && (
            <DisputeContext key={selected.id} id={selected.id} />
          )}
          {selected?.owner_id && (
            <Link
              className="text-sm underline"
              href={`/admin/users/${encodeURIComponent(selected.owner_id)}`}
            >
              View profile
            </Link>
          )}
          {selected?.document_paths?.map((path) => (
            <AdminDocumentLink
              key={path}
              source="verification_request"
              recordId={selected.id}
              path={path}
              className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm hover:bg-muted"
            >
              Open {path.split("/").pop()}
            </AdminDocumentLink>
          ))}
          {actions.length > 0 && (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!selected || busy) return;
                setBusy(true);
                setError("");
                try {
                  await reviewAdminRecord(
                    module,
                    selected.id,
                    action,
                    notes,
                    expires,
                  );
                  setSelected(null);
                  setFeedback(
                    "Action saved and recorded in the audit history.",
                  );
                  await load();
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Unable to save review.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="block text-sm">
                Action
                <StyledSelect
                  className="mt-1 w-full rounded-md border bg-background p-2"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                >
                  {actions.map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </option>
                  ))}
                </StyledSelect>
              </label>
              {module === "users" && action === "suspend" && (
                <label className="block text-sm">
                  Expiration (optional)
                  <Input
                    type="datetime-local"
                    value={expires}
                    onChange={(e) => setExpires(e.target.value)}
                  />
                </label>
              )}
              <label className="block text-sm">
                Reason / review notes (sent to the affected user)
                <Textarea
                  required
                  maxLength={5000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button disabled={busy || !notes.trim()}>
                {busy ? "Saving…" : "Confirm action"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
