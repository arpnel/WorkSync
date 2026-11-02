"use client";
import { StyledSelect } from "@/components/ui/styled-select";

import { ADMIN_PAGE_GUIDANCE } from "./admin-page-guidance";
import AdminMetricCard from "./AdminMetricCard";
import AdminStatusChart from "./AdminStatusChart";
import { filterAdminPage } from "@/services/admin/adminRecordFilters";
import AdminPageHeader from "./AdminPageHeader";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Copy, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
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
import { AdminFilterPanel, AdminStatus } from "@/components/admin/admin-ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  getAdminJobMonitoringDetails,
  getAdminProjectDetails,
  getAdminRecords,
  reviewAdminRecord,
  getAdminReportDetails,
  type AdminModule,
  type AdminResult,
  type AdminRow,
} from "@/services/admin/adminService";

type AdminJobMonitoringDetails = Awaited<
  ReturnType<typeof getAdminJobMonitoringDetails>
>;
type AdminProjectDetails = Awaited<
  ReturnType<typeof getAdminProjectDetails>
>;
type AdminReportDetails = Awaited<ReturnType<typeof getAdminReportDetails>>;

function jobBudget(detail: string) {
  const match = detail.match(/Budget:\s*PHP\s*([\d,.]+)\s*-\s*([\d,.]+)/i);
  if (!match) return "Not recorded";
  const format = (value: string) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(Number(value.replaceAll(",", "")));
  return `${format(match[1])} â€“ ${format(match[2])}`;
}

function jobDescription(detail: string) {
  return detail
    .split(/\r?\n/)
    .filter((line) => !/^Budget:/i.test(line.trim()))
    .join("\n")
    .trim();
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

function reportName(title: string) {
  return title.replace(/^(?:job|service)\s+report:\s*/i, "").trim() || "Listing report";
}

function reportType(title: string) {
  const match = title.match(/^(job|service)\s+report:/i);
  return match ? `${match[1]} report` : "Listing report";
}

function reportDetailFields(detail: string) {
  const lines = detail.split(/\r?\n/);
  const listing = lines.find((line) => /^Listing:\s*/i.test(line))?.replace(/^Listing:\s*/i, "").trim();
  const reporter = lines.find((line) => /^Reporter:\s*/i.test(line))?.replace(/^Reporter:\s*/i, "").trim();
  const adminNotesIndex = lines.findIndex((line) => /^Admin notes:/i.test(line));
  const bodyLines = lines
    .slice(0, adminNotesIndex < 0 ? lines.length : adminNotesIndex)
    .filter((line) => !/^(Listing|Reporter):/i.test(line.trim()));

  return { listing, reporter, reason: bodyLines.join("\n").trim() };
}

function serviceDescription(detail: string) {
  return detail
    .split(/\r?\n/)
    .filter((line) => !/^Price:/i.test(line.trim()))
    .join("\n")
    .trim();
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

function adminStatusLabel(status: string, module: AdminModule) {
  if (module === "services") {
    return (
      {
        active: "Active",
        hidden: "Hidden",
      }[status] ?? status.replaceAll("_", " ")
    );
  }
  return status.replaceAll("_", " ");
}

function verificationDetail(detail: string, label: string) {
  return detail.match(new RegExp(`^${label}:\\s*(.*)$`, "im"))?.[1]?.trim() ?? "Not recorded";
}

function adminJobDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function adminInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}` : parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

function applicantPrice(value: number | string | null) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function projectMoney(value: number | string | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "Not recorded";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function projectDateOnly(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function projectDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
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
  const [draftFromDate, setDraftFromDate] = useState("");
  const [draftToDate, setDraftToDate] = useState("");
  const [sort, setSort] = useState("newest");
  const [jobFiltersOpen, setJobFiltersOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [previousOffsets, setPreviousOffsets] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminRow | null>(null);
  const [jobDetails, setJobDetails] =
    useState<AdminJobMonitoringDetails | null>(null);
  const [jobDetailsError, setJobDetailsError] = useState("");
  const [jobDetailsLoading, setJobDetailsLoading] = useState(false);
  const [projectDetails, setProjectDetails] =
    useState<AdminProjectDetails | null>(null);
  const [projectDetailsError, setProjectDetailsError] = useState("");
  const [projectDetailsLoading, setProjectDetailsLoading] = useState(false);
  const [reportDetails, setReportDetails] = useState<AdminReportDetails | null>(null);
  const [reportDetailsLoading, setReportDetailsLoading] = useState(false);
  const [projectDescriptionOpen, setProjectDescriptionOpen] = useState(false);
  const [proposalApplicant, setProposalApplicant] = useState<
    AdminJobMonitoringDetails["applicants"][number] | null
  >(null);
  const [copiedReference, setCopiedReference] = useState(false);
  const [expires, setExpires] = useState("");
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const sequence = useRef(0);
  const notesLimit = module === "jobs" || module === "projects" || module === "verification" ? 500 : 5000;
  const reportFields =
    module === "reports" && selected
      ? reportDetailFields(selected.detail)
      : null;
  const projectContract = projectDetails?.contract ?? null;
  const projectContractIsSigned = Boolean(
    projectContract?.clientSignedAt &&
      projectContract.freelancerSignedAt &&
      (!projectContract.currentVersion ||
        (projectContract.clientSignedVersion === projectContract.currentVersion &&
          projectContract.freelancerSignedVersion === projectContract.currentVersion)),
  );
  useEffect(() => {
    setCopiedReference(false);
    if (module !== "jobs" || !selected) {
      setJobDetails(null);
      setJobDetailsError("");
      setJobDetailsLoading(false);
      return;
    }
    let current = true;
    setJobDetails(null);
    setJobDetailsError("");
    setJobDetailsLoading(true);
    void getAdminJobMonitoringDetails(selected.id)
      .then((details) => {
        if (current) setJobDetails(details);
      })
      .catch((cause) => {
        if (current)
          setJobDetailsError(
            cause instanceof Error
              ? cause.message
              : "Job participant details could not be loaded.",
          );
      })
      .finally(() => {
        if (current) setJobDetailsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [module, selected]);
  useEffect(() => {
    if (module !== "projects" || !selected) {
      setProjectDetails(null);
      setProjectDetailsError("");
      setProjectDetailsLoading(false);
      setProjectDescriptionOpen(false);
      return;
    }
    let current = true;
    setProjectDescriptionOpen(false);
    setProjectDetails(null);
    setProjectDetailsError("");
    setProjectDetailsLoading(true);
    void getAdminProjectDetails(selected.id)
      .then((details) => {
        if (current) setProjectDetails(details);
      })
      .catch((cause) => {
        if (current)
          setProjectDetailsError(
            cause instanceof Error
              ? cause.message
              : "Project and contract details could not be loaded.",
          );
      })
      .finally(() => {
        if (current) setProjectDetailsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [module, selected]);
  useEffect(() => {
    if (module !== "reports" || !selected) {
      setReportDetails(null);
      setReportDetailsLoading(false);
      return;
    }
    let current = true;
    setReportDetails(null);
    setReportDetailsLoading(true);
    void getAdminReportDetails(selected.id)
      .then((details) => {
        if (current) setReportDetails(details);
      })
      .catch(() => {
        if (current) setReportDetails(null);
      })
      .finally(() => {
        if (current) setReportDetailsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [module, selected]);
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
            ? ["revoke"]
            : module === "projects"
              ? ["cancel_project"]
            : module === "services" || module === "jobs"
              ? ["hide", "restore"]
              : [];
  const adminRows = (data?.rows ?? []).map((row) =>
    module === "services"
      ? { ...row, status: row.status.trim().toLowerCase() }
      : row,
  );
  const visibleRows = filterAdminPage(
    adminRows,
    statusFilter,
    fromDate,
    toDate,
    sort,
  );
  const statusCounts = adminRows.reduce<Record<string, number>>(
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
  const canRevokeVerification = Boolean(
    isVerificationModule &&
      selected?.status === "approved" &&
      verificationDetail(selected.detail, "Provider").toLowerCase() === "didit" &&
      verificationDetail(selected.detail, "Current").toLowerCase() === "true",
  );
  const isStructuredRecordsModule =
    module === "jobs" ||
    module === "services" ||
    module === "projects" ||
    isModerationRecordModule || isUserModule || isAuditModule || isVerificationModule;
  const usesAdminTableLayout = [
    "jobs",
    "services",
    "projects",
    "reports",
    "verification",
    "disputes",
  ].includes(module);
  const listingStatuses = [
    ...new Set([
      ...(module === "jobs"
        ? ["open", "hidden"]
        : module === "services"
          ? ["active", "hidden"]
          : module === "projects"
            ? ["active", "in_progress", "completed", "cancelled"]
            : module === "reports"
              ? ["pending", "under_review", "resolved", "dismissed"]
              : module === "disputes" ? ["open", "under_review", "resolved", "closed"] : module === "users" ? ["active", "suspended"] : module === "verification" ? ["pending", "approved", "rejected", "expired", "revoked"] : []),
      ...(module === "jobs" || module === "services"
        ? []
        : adminRows.map((row) => row.status)),
    ]),
  ];
  const listingTotal = data?.total ?? data?.rows.length ?? 0;
  const matchingCount =
    statusFilter === "all" && !fromDate && !toDate
      ? listingTotal
      : visibleRows.length;
  const loadedPageLabel =
    data?.total == null ? "Loaded page only" : "All records";
  const isListingModule = ["jobs", "services", "projects"].includes(module);
  const recordNoun =
    module === "jobs"
      ? "jobs"
      : module === "services"
        ? "services"
        : module === "projects"
          ? "projects"
          : module === "reports"
            ? "reports"
            : module === "verification"
              ? "verification requests"
              : "disputes";
  const statusFilterNoun =
    module === "jobs"
      ? "job"
      : module === "services"
        ? "service"
        : module === "projects"
          ? "project"
          : module === "reports"
            ? "report"
            : module === "verification"
              ? "verification request"
              : "dispute";
  const allStatusLabel =
    module === "jobs"
      ? "All jobs"
      : module === "services"
        ? "All services"
        : module === "projects"
          ? "All projects"
          : module === "reports"
            ? "All reports"
            : module === "verification"
              ? "All requests"
              : "All disputes";
  function clearTableFilters() {
    setSearch("");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
    setDraftFromDate("");
    setDraftToDate("");
    setJobFiltersOpen(false);
    setOffset(0);
    setPreviousOffsets([]);
  }
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
            {module !== "reports" && module !== "disputes" && (
              <p className="text-xs text-muted-foreground">{loadedPageLabel}</p>
            )}
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
                      : module === "disputes" ? "Open" : module === "audit" ? "Event types" : module === "verification" ? "In progress" : "Active"}
            </p>
            <p className="text-xl font-semibold tabular-nums">
              {isAuditModule ? Object.keys(statusCounts).length.toLocaleString() : isVerificationModule ? (statusCounts.pending ?? 0).toLocaleString() : reviewMetric.toLocaleString()}
            </p>
            {module !== "reports" && module !== "disputes" && (
              <p className="text-xs text-muted-foreground">On the loaded page</p>
            )}
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
                      : module === "disputes" ? "Resolved / closed" : module === "audit" ? "Actors on loaded page" : module === "verification" ? "Approved / revoked" : "Suspended"}
            </p>
            <p className="text-xl font-semibold tabular-nums">
              {isAuditModule ? new Set((data?.rows ?? []).map((row) => row.owner_id).filter(Boolean)).size.toLocaleString() : isVerificationModule ? ((statusCounts.approved ?? 0) + (statusCounts.revoked ?? 0)).toLocaleString() : closedMetric.toLocaleString()}
            </p>
            {module !== "reports" && module !== "disputes" && (
              <p className="text-xs text-muted-foreground">On the loaded page</p>
            )}
          </Card>
          {isModerationRecordModule && (
            <Card className="gap-1 rounded-xl border p-3 shadow-none">
              <p className="text-xs text-muted-foreground">Under review</p>
              <p className="text-xl font-semibold tabular-nums">
                {(statusCounts.under_review ?? 0).toLocaleString()}
              </p>
              {module !== "reports" && module !== "disputes" && (
                <p className="text-xs text-muted-foreground">On the loaded page</p>
              )}
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
              <div className="flex shrink-0 gap-2">
                {usesAdminTableLayout ? (
                  <Popover
                    open={jobFiltersOpen}
                    onOpenChange={(open) => {
                      if (open) {
                        setDraftFromDate(fromDate);
                        setDraftToDate(toDate);
                      }
                      setJobFiltersOpen(open);
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className="h-10">
                        <SlidersHorizontal className="size-4" />
                        Filters
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="w-[min(22rem,calc(100vw-2rem))] p-4"
                    >
                      <div className="grid gap-4">
                        <label className="grid gap-1.5 text-sm font-medium">
                          Created from
                          <Input
                            className="h-10 bg-background font-normal"
                            type="date"
                            value={draftFromDate}
                            max={draftToDate || undefined}
                            onChange={(event) => setDraftFromDate(event.target.value)}
                          />
                        </label>
                        <label className="grid gap-1.5 text-sm font-medium">
                          Created to
                          <Input
                            className="h-10 bg-background font-normal"
                            type="date"
                            value={draftToDate}
                            min={draftFromDate || undefined}
                            onChange={(event) => setDraftToDate(event.target.value)}
                          />
                        </label>
                        <div className="flex items-center justify-between border-t pt-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDraftFromDate("");
                              setDraftToDate("");
                            }}
                          >
                            <X className="size-4" />
                            Clear dates
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setFromDate(draftFromDate);
                              setToDate(draftToDate);
                              setOffset(0);
                              setJobFiltersOpen(false);
                            }}
                          >
                            Apply
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10"
                    aria-label={jobFiltersOpen ? "Hide filters" : "Show filters"}
                    aria-expanded={jobFiltersOpen}
                    onClick={() => setJobFiltersOpen((open) => !open)}
                  >
                    <SlidersHorizontal className="size-4" />
                  </Button>
                )}
                {usesAdminTableLayout && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 shrink-0"
                    aria-label={`Refresh ${module}`}
                    onClick={() => void load()}
                    disabled={loading}
                  >
                    <RefreshCw
                      className={`size-4 ${loading ? "animate-spin" : ""}`}
                    />
                  </Button>
                )}
              </div>
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={`Filter by ${statusFilterNoun} status`}
            >
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-medium ${statusFilter === "all" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                aria-pressed={statusFilter === "all"}
                onClick={() => setStatusFilter("all")}
              >
                {allStatusLabel}
              </button>
              {listingStatuses.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusFilter === value ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  aria-pressed={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                >
                  {adminStatusLabel(value, module)}
                </button>
              ))}
            </div>
            {!usesAdminTableLayout && jobFiltersOpen && (
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
        {module !== "reports" && module !== "disputes" && (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {isStructuredRecordsModule
              ? `Search checks ${module === "jobs" ? "job" : module === "services" ? "service" : module === "projects" ? "project" : "dispute"} titles, statuses, and references. Status, dates, and sorting apply to the loaded page.`
              : "Search checks all records. Status, dates, and sorting apply to the loaded page."}
          </p>
        )}
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
              {module !== "reports" && (
                <h2 className="font-semibold">
                  {module === "jobs"
                    ? "Job records"
                    : module === "services"
                      ? "Service records"
                      : module === "projects"
                        ? "Project records"
                        : module === "disputes" ? "Dispute records" : module === "audit" ? "Audit entries" : module === "verification" ? "Verification requests" : "User records"}
                </h2>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                {module === "jobs"
                  ? "Job listings and their current moderation status."
                  : module === "services"
                    ? "Freelancer services and their current moderation status."
                    : module === "projects"
                      ? "Projects, budgets, participants, and delivery status."
                      : module === "reports"
                        ? "Reported listings and their review status."
                        : module === "disputes" ? "Project disputes and their resolution status." : module === "audit" ? "Administrative actions recorded for review." : module === "verification" ? "Monitor identity decisions returned by Didit. Revoke an approved result only when a specific case requires it." : "Accounts and their current access status."}
              </p>
              {data && (
                <Badge variant="outline" className="mt-1 w-fit font-normal">
                  {usesAdminTableLayout
                    ? `${matchingCount.toLocaleString()} matching`
                    : `${listingTotal.toLocaleString()} ${listingTotal === 1 ? "record" : "records"}${data.total == null ? " loaded" : ""}`}
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
            <ContentSkeleton label="Loading records" variant="admin-table" />
          ) : isStructuredRecordsModule ? (
            usesAdminTableLayout && visibleRows.length === 0 ? null : (
            <div className={usesAdminTableLayout ? "rounded-lg border" : ""}>
            <Table className={module === "projects" ? "min-w-[1120px]" : usesAdminTableLayout ? "min-w-[920px]" : "min-w-[900px]"}>
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
                    <TableCell className={usesAdminTableLayout ? "max-w-64" : "max-w-sm"}>
                      <p className="truncate font-medium">{row.title}</p>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {row.id}
                      </p>
                    </TableCell>
                    <TableCell className="font-medium">
                      {module === "projects" ? (
                        <div className="space-y-1 text-xs">
                          <p>Client: {projectDetailValue(row.detail, "Client account")}</p>
                          <p>Freelancer: {projectDetailValue(row.detail, "Freelancer account")}</p>
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
                    <TableCell className={`whitespace-nowrap ${usesAdminTableLayout && isListingModule ? "font-semibold tabular-nums" : "font-medium"}`}>
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
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {row.created_at
                        ? usesAdminTableLayout
                          ? new Date(row.created_at).toLocaleString()
                          : new Date(row.created_at).toLocaleDateString()
                        : "Not recorded"}
                    </TableCell>
                    <TableCell>
                      {usesAdminTableLayout ? (
                        <AdminStatus
                          tone={
                            ["open", "active", "in_progress", "approved", "resolved", "completed"].includes(row.status)
                              ? "green"
                              : ["closed", "cancelled", "canceled", "rejected", "hidden", "dismissed"].includes(row.status)
                                ? "neutral"
                                : "orange"
                          }
                        >
                          {adminStatusLabel(row.status, module)}
                        </AdminStatus>
                      ) : (
                        <Badge
                          variant="secondary"
                          className={`rounded-full font-medium capitalize ${["open", "active", "in_progress"].includes(row.status) ? "bg-blue-500/15 text-blue-500" : ""}`}
                        >
                          {row.status.replaceAll("_", " ")}
                        </Badge>
                      )}
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
            </div>
            )
          ) : (
            <Table>
              <TableHeader className="hidden md:table-header-group">
                <TableRow>
                  <TableHead>
                    "Name / reference"
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
                        : "â€”"}
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
            usesAdminTableLayout ? (
              <div className="space-y-2 border-y px-4 py-12 text-center">
                <p className="font-medium">No {recordNoun} found</p>
                <p className="text-sm text-muted-foreground">
                  Try a different search or clear the filters.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearTableFilters}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
                No records match this selection. Reset page filters or try another
                page.
              </p>
            )
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
                {usesAdminTableLayout
                  ? matchingCount === 0
                    ? `0 ${recordNoun}`
                    : `Showing ${visibleRows.length} of ${matchingCount.toLocaleString()} ${recordNoun}`
                  : isStructuredRecordsModule && data?.total != null
                  ? statusFilter === "all" && !fromDate && !toDate
                    ? `Showing ${data.rows.length ? data.offset + 1 : 0}â€“${data.offset + data.rows.length} of ${data.total.toLocaleString()}`
                    : `Showing ${visibleRows.length} of ${data.rows.length} loaded Â· ${data.total.toLocaleString()} total`
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
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-3xl">
          {module === "jobs" && selected ? (
            <div className="space-y-2 border-b pb-5 pr-7">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-lg">{selected.title}</DialogTitle>
                <Badge variant="secondary" className="capitalize">
                  {(jobDetails?.status ?? selected.status).replaceAll("_", " ")}
                  {jobDetails?.projectType
                    ? ` Â· ${jobDetails.projectType.replaceAll("_", " ")}`
                    : ""}
                </Badge>
              </div>
              <DialogDescription className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {jobDescription(selected.detail)}
              </DialogDescription>
              <div className="flex min-w-0 items-center gap-2">
                <span className="break-all text-xs text-muted-foreground">
                  Reference: {selected.id}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selected.id);
                      setCopiedReference(true);
                    } catch {
                      setCopiedReference(false);
                    }
                  }}
                  aria-label="Copy job reference"
                  title={copiedReference ? "Copied" : "Copy reference"}
                  className="shrink-0"
                >
                  {copiedReference ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <p className="text-sm">
                <span className="font-medium">Budget:</span> {jobBudget(selected.detail)}
              </p>
            </div>
          ) : module === "services" && selected ? (
            <div className="space-y-3 border-b pb-5 pr-7">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-lg">{selected.title}</DialogTitle>
                <AdminStatus tone={selected.status === "active" ? "green" : selected.status === "hidden" ? "neutral" : "orange"}>
                  {selected.status.replaceAll("_", " ")}
                </AdminStatus>
              </div>
              <DialogDescription className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {serviceDescription(selected.detail) || "No service description provided."}
              </DialogDescription>
              <div className="flex min-w-0 items-center gap-2">
                <span className="break-all text-xs text-muted-foreground">
                  Reference: {selected.id}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selected.id);
                      setCopiedReference(true);
                    } catch {
                      setCopiedReference(false);
                    }
                  }}
                  aria-label="Copy service reference"
                  title={copiedReference ? "Copied" : "Copy reference"}
                  className="shrink-0"
                >
                  {copiedReference ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>
          ) : module === "projects" && selected ? (
            <div className="space-y-2 border-b pb-3 pr-7">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-2xl">
                  {projectDetails?.project.title ?? selected.title}
                </DialogTitle>
                <Badge
                  variant="secondary"
                  className={`capitalize ${(projectDetails?.project.status ?? selected.status).toLowerCase() === "completed" ? "bg-emerald-600/15 text-emerald-600" : ""}`}
                >
                  {(projectDetails?.project.status ?? selected.status).replaceAll("_", " ")}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {(projectDetails?.project.projectType ?? "standard").replaceAll("_", " ")}
                </Badge>
              </div>
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span className="shrink-0 text-muted-foreground">Project ref:</span>
                <span className="min-w-0 break-all text-muted-foreground">
                  {selected.id}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-7 shrink-0"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selected.id);
                      setCopiedReference(true);
                    } catch {
                      setCopiedReference(false);
                    }
                  }}
                  aria-label="Copy project reference"
                  title={copiedReference ? "Copied" : "Copy reference"}
                >
                  {copiedReference ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
                {projectDetails?.project.description?.trim() && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0"
                    aria-haspopup="dialog"
                    onClick={() => setProjectDescriptionOpen(true)}
                  >
                    View description
                  </Button>
                )}
              </div>
            </div>
          ) : module === "reports" && selected ? (
            <div className="space-y-2 border-b pb-3 pr-7">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-xl">Report details</DialogTitle>
                <Badge variant="secondary" className="capitalize">
                  {reportType(selected.title)}
                </Badge>
              </div>
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span className="break-all text-muted-foreground">
                  Reference: {selected.id}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-7 shrink-0"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selected.id);
                      setCopiedReference(true);
                    } catch {
                      setCopiedReference(false);
                    }
                  }}
                  aria-label="Copy report reference"
                  title={copiedReference ? "Copied" : "Copy reference"}
                >
                  {copiedReference ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>
          ) : module === "disputes" && selected ? (
            <div className="space-y-2 border-b pb-3 pr-7">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-xl">Dispute details</DialogTitle>
                <AdminStatus tone={selected.status === "resolved" || selected.status === "closed" ? "green" : selected.status === "open" ? "orange" : "blue"}>
                  {selected.status.replaceAll("_", " ")}
                </AdminStatus>
              </div>
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span className="break-all text-muted-foreground">Reference: {selected.id}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-7 shrink-0"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selected.id);
                      setCopiedReference(true);
                    } catch {
                      setCopiedReference(false);
                    }
                  }}
                  aria-label="Copy dispute reference"
                  title={copiedReference ? "Copied" : "Copy reference"}
                >
                  {copiedReference ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <DialogHeader>
              <DialogTitle>{selected?.title}</DialogTitle>
              <DialogDescription>Reference: {selected?.id}</DialogDescription>
            </DialogHeader>
          )}
          {module === "disputes" && selected?.detail?.trim() && (
            <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
              <h3 className="font-semibold text-amber-700 dark:text-amber-300">Dispute summary</h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{selected.detail}</p>
            </section>
          )}
          {module !== "jobs" && module !== "services" && module !== "projects" && module !== "reports" && module !== "disputes" && (
            <p className="whitespace-pre-wrap break-words text-sm">{selected?.detail}</p>
          )}
          {module === "reports" && selected && reportFields && (
            <section className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 rounded-xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reported listing</p>
                  <p className="mt-1 break-all text-sm font-medium">{reportFields.listing || "Not available"}</p>
                </div>
                <div className="min-w-0 rounded-xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reporter account</p>
                  <p className="mt-1 text-sm font-semibold">
                    {reportDetails?.reporterName ?? (reportDetailsLoading ? "Loading nameâ€¦" : "Name unavailable")}
                  </p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    Account ID: {reportDetails?.reporterId ?? reportFields.reporter ?? "Not available"}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Reason:</p>
                  <p className="text-sm font-medium">{reportName(selected.title)}</p>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {reportFields.reason || "No additional reason was provided."}
                </p>
              </div>
            </section>
          )}
          {module === "jobs" && selected && (
            <section className="space-y-4">
              <h3 className="font-semibold">Job participants and details</h3>
              {jobDetailsLoading ? (
                <div
                  role="status"
                  aria-label="Loading job details"
                  aria-busy="true"
                  className="animate-pulse space-y-4"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-4">
                      <span className="size-11 rounded-full bg-muted" />
                      <div className="flex-1 space-y-2">
                        <span className="block h-3 w-28 rounded bg-muted" />
                        <span className="block h-4 w-36 rounded bg-muted" />
                      </div>
                    </div>
                    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                      <span className="block h-3 w-36 rounded bg-muted" />
                      <span className="block h-3 w-full rounded bg-muted" />
                      <span className="block h-3 w-4/5 rounded bg-muted" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="block h-4 w-40 rounded bg-muted" />
                    <div className="h-16 rounded-xl border bg-muted/20" />
                  </div>
                </div>
              ) : jobDetailsError ? (
                <p className="text-sm text-destructive">{jobDetailsError}</p>
              ) : jobDetails ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                          {adminInitials(jobDetails.clientName)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client / employer</p>
                          <p className="mt-1 truncate text-base font-semibold">{jobDetails.clientName}</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Listing requirements</p>
                      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                        <dt className="text-muted-foreground">Deadline</dt>
                        <dd className="text-right font-medium">{adminJobDate(jobDetails.deadline)}</dd>
                        <dt className="text-muted-foreground">Experience</dt>
                        <dd className="flex justify-end">
                          <Badge variant="secondary" className="capitalize">
                            {jobDetails.experienceLevel?.replaceAll("_", " ") ?? "Not specified"}
                          </Badge>
                        </dd>
                      </dl>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 border-b pb-2">
                      <h4 className="font-semibold">Freelancer applicants</h4>
                    </div>
                    {jobDetails.applicants.length ? (
                      <div className="space-y-2">
                        {jobDetails.applicants.slice(0, 8).map((applicant) => {
                          const price = applicantPrice(applicant.proposedPrice);
                          return (
                            <div
                              key={applicant.applicationId}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 px-4 py-3"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                                  {adminInitials(applicant.name)}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate font-medium">{applicant.name}</p>
                                    <Badge variant="secondary" className="capitalize">
                                      {applicant.status.replaceAll("_", " ")}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Applied {adminJobDate(applicant.appliedAt)}
                                    {price ? ` Â· Proposed ${price}` : ""}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setProposalApplicant(applicant);
                                  }}
                                >
                                  Proposal
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
                        No freelancer applications have been submitted.
                      </p>
                    )}
                    {(jobDetails.applicants.length > 8 ||
                      jobDetails.hasMoreApplicants) && (
                      <p className="text-xs text-muted-foreground">
                        Showing the 8 most recent applicants.
                      </p>
                    )}
                  </div>
                </>
              ) : null}
            </section>
          )}
          {module === "projects" && selected && (
            <section className="space-y-3">
              {projectDetailsLoading ? (
                <div role="status" aria-label="Loading project details" aria-busy="true">
                  <span className="sr-only">Loading project details</span>
                  <div aria-hidden="true" className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {Array.from({ length: 4 }, (_, index) => (
                        <div key={index} className="space-y-2 rounded-lg bg-muted/60 p-3">
                          <Skeleton className="h-3 w-2/5" />
                          <Skeleton className="h-5 w-3/4" />
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {Array.from({ length: 2 }, (_, index) => (
                        <div key={index} className="space-y-4 rounded-lg border p-4">
                          <Skeleton className="h-5 w-1/3" />
                          {Array.from({ length: 2 }, (__, row) => (
                            <div key={row} className="flex items-center justify-between gap-4">
                              <Skeleton className="h-4 w-1/4" />
                              <Skeleton className="h-5 w-2/5" />
                            </div>
                          ))}
                          <Skeleton className="h-3 w-4/5" />
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <Skeleton className="h-5 w-1/4" />
                        <Skeleton className="h-3 w-1/5" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {Array.from({ length: 3 }, (_, index) => (
                          <div key={index} className="space-y-2 rounded-lg bg-muted/50 p-3">
                            <Skeleton className="h-3 w-3/4" />
                            <Skeleton className="h-5 w-1/3" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : projectDetailsError ? (
                <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  {projectDetailsError}
                </p>
              ) : projectDetails ? (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["Budget", projectMoney(projectDetails.project.budget)],
                      ["Started", projectDateOnly(projectDetails.project.startDate)],
                      ["Deadline", projectDateOnly(projectDetails.project.dueDate)],
                      ["Completed", projectDetails.project.completedAt ? projectDateOnly(projectDetails.project.completedAt) : "Not completed"],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0 rounded-lg bg-muted/60 p-2.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                        <p className="mt-1 truncate text-base font-semibold tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <section className="min-w-0 rounded-lg border p-3">
                      <h3 className="mb-2 text-lg font-semibold">Participants</h3>
                      {!projectDetails.participantNamesAvailable && (
                        <p className="mb-2 text-sm text-muted-foreground">Some participant names could not be loaded.</p>
                      )}
                      <dl className="space-y-2 text-base">
                        <div className="flex items-start justify-between gap-3">
                          <dt className="text-muted-foreground">Client</dt>
                          <dd className="text-right text-lg font-semibold">{projectDetails.clientName}</dd>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <dt className="text-muted-foreground">Freelancer</dt>
                          <dd className="text-right text-lg font-semibold">{projectDetails.freelancerName}</dd>
                        </div>
                      </dl>
                      {(projectDetails.project.orderId || projectDetails.project.applicationId) && (
                        <div className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                          {projectDetails.project.orderId && <p className="break-all">Order ref: {projectDetails.project.orderId}</p>}
                          {projectDetails.project.applicationId && <p className="break-all">Application ref: {projectDetails.project.applicationId}</p>}
                        </div>
                      )}
                    </section>

                    <section className="min-w-0 rounded-lg border p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h3 className="text-lg font-semibold">Contract</h3>
                        {projectContract && (
                          <Badge variant="secondary" className={projectContractIsSigned ? "bg-emerald-600/15 text-emerald-600" : "capitalize"}>
                            {projectContractIsSigned ? "Signed" : projectContract.status.replaceAll("_", " ")}
                          </Badge>
                        )}
                      </div>
                      {projectContract ? (
                        <>
                          <dl className="space-y-2 text-base">
                            <div className="flex items-center justify-between gap-3">
                              <dt className="text-muted-foreground">Delivery time</dt>
                              <dd className="text-right text-lg font-semibold">
                                {projectContract.deliveryDays == null
                                  ? "Not recorded"
                                  : `${projectContract.deliveryDays} ${projectContract.deliveryDays === 1 ? "day" : "days"}`}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <dt className="text-muted-foreground">Revisions</dt>
                              <dd className="text-right text-lg font-semibold">{projectContract.revisions ?? "Not recorded"}</dd>
                            </div>
                          </dl>
                          <div className="mt-2 space-y-1 border-t pt-2 text-xs leading-relaxed text-muted-foreground">
                            <p>Client signed {projectDate(projectContract.clientSignedAt)}</p>
                            <p>Freelancer signed {projectDate(projectContract.freelancerSignedAt)}</p>
                          </div>
                          <p className="mt-1 break-all text-xs text-muted-foreground">Contract ref: {projectContract.id}</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {projectDetails.contractAvailable ? "No linked contract." : "Contract details unavailable."}
                        </p>
                      )}
                    </section>
                  </div>

                  {((projectDetails.taskProgress?.total ?? 0) > 0 ||
                    projectDetails.milestones.length > 0) && (
                  <section className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold">Work progress</h3>
                      <span className="text-xs text-muted-foreground">
                        {projectDetails.taskProgress
                          ? `${projectDetails.taskProgress.total} tasks Â· `
                          : ""}
                        {projectDetails.milestones.length} milestones
                      </span>
                    </div>
                    {projectDetails.taskProgress && (
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        {[
                          ["In progress", projectDetails.taskProgress.inProgress],
                          ["Completed", projectDetails.taskProgress.completed],
                          ["Overdue", projectDetails.taskProgress.overdue],
                        ].map(([label, count]) => (
                          <div key={label} className="rounded-lg bg-muted/50 p-2">
                            <p className="text-muted-foreground">{label}</p>
                            <p className="mt-0.5 font-semibold tabular-nums">{count}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {projectDetails.milestones.length > 0 && (
                      <div className="overflow-hidden rounded-lg border">
                        {projectDetails.milestones.map((milestone) => (
                          <div key={milestone.id} className="grid gap-1 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{milestone.title}</p>
                              {milestone.description && <p className="line-clamp-1 text-xs text-muted-foreground">{milestone.description}</p>}
                            </div>
                            <span className="text-sm font-semibold tabular-nums">{projectMoney(milestone.amount)}</span>
                            <span className="text-xs text-muted-foreground">Due {projectDateOnly(milestone.dueDate)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  )}
                </>
              ) : null}
            </section>
          )}
          {module === "services" && selected && (
            <section className="space-y-4">
              <h3 className="font-semibold">Service participants and details</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Freelancer account</p>
                    <p className="mt-1 truncate font-medium">{selected.owner_id ? `ID ${selected.owner_id.slice(0, 8)}` : "Not available"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Created {selected.created_at ? new Date(selected.created_at).toLocaleDateString() : "Not recorded"}</p>
                  </div>
                  {selected.owner_id && (
                    <Button asChild type="button" variant="outline" size="sm" className="shrink-0">
                      <Link href={`/admin/users/${encodeURIComponent(selected.owner_id)}`}>View profile</Link>
                    </Button>
                  )}
                </div>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Listing details</p>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Price</dt>
                    <dd className="text-right font-semibold tabular-nums">{servicePrice(selected.detail)}</dd>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="text-right font-medium">{selected.created_at ? new Date(selected.created_at).toLocaleDateString() : "Not recorded"}</dd>
                  </dl>
                </div>
              </div>
            </section>
          )}
          {module === "disputes" && selected && (
            <DisputeContext key={selected.id} id={selected.id} />
          )}
          {isVerificationModule && selected && (
            <section className="rounded-xl border bg-muted/10 p-4">
              <h3 className="font-semibold">Didit verification record</h3>
              <dl className="mt-3 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Provider</dt>
                  <dd className="mt-1 font-medium">{verificationDetail(selected.detail, "Provider")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Provider decision</dt>
                  <dd className="mt-1 font-medium">{verificationDetail(selected.detail, "Provider status")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Current request</dt>
                  <dd className="mt-1 font-medium">{verificationDetail(selected.detail, "Current")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Provider approval time</dt>
                  <dd className="mt-1 font-medium">{verificationDetail(selected.detail, "Verified")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last review</dt>
                  <dd className="mt-1 font-medium">{verificationDetail(selected.detail, "Reviewed")}</dd>
                </div>
              </dl>
            </section>
          )}
          {selected?.owner_id && module !== "jobs" && module !== "services" && module !== "reports" && module !== "disputes" && (
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
          {actions.length > 0 && (!isVerificationModule || canRevokeVerification) &&
            (module !== "projects" || !["completed", "cancelled"].includes(
              (projectDetails?.project.status ?? selected?.status ?? "").toLowerCase(),
            )) && (
            <form
              className={`space-y-4 ${module === "jobs" || module === "services" ? "rounded-xl border bg-muted/10 p-5" : module === "projects" ? "rounded-xl border border-destructive/40 bg-destructive/5 p-5" : ""}`}
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
              {(module === "jobs" || module === "services" || module === "projects") && (
                <h3 className="text-base font-semibold">
                  {module === "projects" ? "Project actions" : "Moderation and administrative actions"}
                </h3>
              )}
              {module === "projects" && (
                <p className="text-sm text-muted-foreground">
                  Cancelling marks this project as cancelled and records the reason in the admin audit history. It does not issue a refund or payout.
                </p>
              )}
              {isVerificationModule ? (
                <div>
                  <h3 className="font-semibold">Revoke identity verification</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use this only when a specific case requires removing the approved verification.
                  </p>
                </div>
              ) : <label className="block text-sm">
                {module === "jobs" || module === "services" ? "Select action" : "Action"}
                <StyledSelect
                  className="mt-1 w-full rounded-md border bg-background p-2"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                >
                  {actions.map((value) => (
                    <option key={value} value={value}>
                      {module === "projects" && value === "cancel_project"
                        ? "Cancel project"
                        : (module === "jobs" || module === "services") && value === "hide"
                        ? "Hide listing"
                        : (module === "jobs" || module === "services") && value === "restore"
                          ? "Restore"
                        : value.replaceAll("_", " ")}
                    </option>
                  ))}
                </StyledSelect>
              </label>}
              {module === "reports" && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Quick review actions</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      {
                        label: "Needs more review",
                        action: "under_review",
                        note: "This report needs further review before a final decision can be made.",
                      },
                      {
                        label: "Violation confirmed",
                        action: "resolved",
                        note: "The reported listing was reviewed and a policy violation was confirmed.",
                      },
                      {
                        label: "No violation found",
                        action: "dismissed",
                        note: "The report was reviewed and no policy violation was identified.",
                      },
                    ].map((preset) => (
                      <Button
                        key={preset.action}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAction(preset.action);
                          setNotes(preset.note);
                        }}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {(module === "jobs" || module === "services") && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Quick reason tags</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      {
                        label: "Misleading description",
                        reason: "This listing has a misleading description.",
                      },
                      {
                        label: module === "jobs" ? "Unrealistic budget" : "Unrealistic price",
                        reason: module === "jobs"
                          ? "The proposed budget is unrealistic for this work."
                          : "The listed service price is unrealistic for the described scope.",
                      },
                      {
                        label: "Spam / duplicate",
                        reason: "This listing appears to be spam or a duplicate.",
                      },
                    ].map(({ label, reason }) => (
                      <Button
                        key={label}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setNotes((current) =>
                            current.trim()
                              ? `${current.trim()}\n${reason}`
                              : reason,
                          )
                        }
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
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
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {isVerificationModule
                      ? "Reason for revocation (required)"
                      : `Reason / review notes${module === "projects" ? " (recorded in admin audit history)" : module !== "jobs" ? " (sent to the affected user)" : ""}`}
                  </span>
                    {(module === "jobs" || module === "projects") && (
                    <span className="text-xs text-muted-foreground">
                      {notes.length} / {notesLimit.toLocaleString()}
                    </span>
                  )}
                </span>
                <Textarea
                  required
                  maxLength={notesLimit}
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
                {busy
                  ? "Savingâ€¦"
                  : module === "projects" && action === "cancel_project"
                    ? "Confirm project cancellation"
                    : isVerificationModule
                      ? "Revoke verification"
                    : "Confirm action"}
              </Button>
            </form>
          )}
          <Dialog
            open={!!proposalApplicant}
            onOpenChange={(open) => {
              if (!open) setProposalApplicant(null);
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
              <DialogHeader>
                <DialogTitle>Freelancer proposal</DialogTitle>
                <DialogDescription>
                  Submitted by {proposalApplicant?.name ?? "Freelancer"}
                </DialogDescription>
              </DialogHeader>
              {proposalApplicant && (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Application status</p>
                      <Badge variant="secondary" className="mt-1 capitalize">
                        {proposalApplicant.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Proposed price</p>
                      <p className="mt-1 font-semibold">
                        {applicantPrice(proposalApplicant.proposedPrice) ?? "Not provided"}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Estimated delivery</p>
                      <p className="mt-1 font-semibold">
                        {proposalApplicant.estimatedDays != null &&
                        Number.isFinite(Number(proposalApplicant.estimatedDays))
                          ? `${Number(proposalApplicant.estimatedDays)} ${Number(proposalApplicant.estimatedDays) === 1 ? "day" : "days"}`
                          : "Not provided"}
                      </p>
                    </div>
                  </div>

                  <section className="space-y-2">
                    <h3 className="font-semibold">Proposal</h3>
                    <div className="min-h-20 rounded-lg border bg-muted/10 p-4">
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {proposalApplicant.proposal?.trim() || "No written proposal was included."}
                      </p>
                    </div>
                  </section>

                  <section className="space-y-3">
                    <div>
                      <h3 className="font-semibold">
                        {proposalApplicant.proposedPlan?.name ?? "Kanban board"}
                      </h3>
                      {proposalApplicant.proposedPlan ? (
                        <p className="text-sm text-muted-foreground">
                          {proposalApplicant.proposedPlan.content.columns.length} stages Â· {proposalApplicant.proposedPlan.content.columns.reduce((total, column) => total + column.tasks.length, 0)} tasks
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {!jobDetails?.planSnapshotsAvailable
                            ? "Saved Kanban plan snapshots are not available in the current database."
                            : "No Kanban board was attached to this application."}
                        </p>
                      )}
                    </div>
                    {proposalApplicant.proposedPlan && (
                      <>
                        {proposalApplicant.proposedPlan.description && (
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {proposalApplicant.proposedPlan.description}
                          </p>
                        )}
                        <div className="-mx-4 overflow-x-auto px-4 pb-3">
                          <div className="flex w-max min-w-full items-stretch gap-3">
                            {proposalApplicant.proposedPlan.content.columns.map((column) => (
                              <section
                                key={column.id}
                                className="w-64 shrink-0 rounded-xl border-t-2 border-t-primary/50 bg-muted/25 p-3 sm:w-72"
                              >
                                <div className="mb-3 flex items-center justify-between gap-2">
                                  <h4 className="break-words text-sm font-semibold">{column.name}</h4>
                                  <Badge variant="secondary">{column.tasks.length}</Badge>
                                </div>
                                {column.tasks.length ? (
                                  <div className="space-y-2">
                                    {column.tasks.map((task) => (
                                      <article key={task.id} className="rounded-lg border bg-card p-3">
                                        <h5 className="break-words text-sm font-medium">{task.title}</h5>
                                        {task.description && (
                                          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                                            {task.description}
                                          </p>
                                        )}
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                          <Badge variant="outline" className="capitalize">{task.priority} priority</Badge>
                                          {task.expectedDays != null && (
                                            <span className="text-xs text-muted-foreground">
                                              {task.expectedDays} {task.expectedDays === 1 ? "day" : "days"}
                                            </span>
                                          )}
                                        </div>
                                      </article>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">No tasks in this stage.</p>
                                )}
                              </section>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </section>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
      <Dialog
        open={projectDescriptionOpen}
        onOpenChange={setProjectDescriptionOpen}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Project description</DialogTitle>
            <DialogDescription>
              {projectDetails?.project.title ?? selected?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {projectDetails?.project.description || "Project description unavailable."}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
