"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ShieldCheck,
  Scale,
  ChartNoAxesCombined,
  ClipboardCheck,
  ScrollText,
  Store,
  Wallet,
} from "lucide-react";
import {
  getAdminRecords,
  getAdminQuickActionCounts,
  type AdminResult,
  type AdminModule,
  type AdminQuickActionCounts,
} from "@/services/admin/adminService";
import { ADMIN_MODULES } from "@/services/admin/adminModules";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import AdminMetricCard from "./AdminMetricCard";
import AdminStatusChart from "./AdminStatusChart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
const feeds = [
  {
    module: ADMIN_MODULES.transactions,
    title: "Recent transactions",
    href: "/admin/financial",
    description: "Latest recorded payments and their current status.",
  },
  {
    module: ADMIN_MODULES.services,
    title: "New services on the marketplace",
    href: "/admin/services",
    description:
      "Recently listed freelancer offerings. Ordered by recency, not popularity.",
  },
  {
    module: ADMIN_MODULES.projects,
    title: "Latest client projects",
    href: "/admin/projects",
    description: "Keep an eye on new engagements and delivery status.",
  },
  {
    module: ADMIN_MODULES.overview,
    title: "Recent admin activity",
    href: "/admin/audit",
    description: "Latest moderation decisions and recorded actions.",
  },
] as const;
const reviewModules = [
  ADMIN_MODULES.disputes,
  ADMIN_MODULES.reports,
  ADMIN_MODULES.verification,
] as const;
type FeedState = { data?: AdminResult; error?: string };

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    resolve_dispute: "Dispute resolved",
    cancel_project: "Project cancelled",
    moderate_account: "Account moderation updated",
    "service:hide": "Service listing hidden",
    "service:restore": "Service listing restored",
    "job:hide": "Job listing hidden",
    "job:restore": "Job listing restored",
  };
  if (labels[action.toLowerCase()]) return labels[action.toLowerCase()];
  return action
    .split(":")
    .map((part) => part.replaceAll("_", " ").trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" · ");
}

function auditTargetLabel(action: string) {
  const prefix = action.split(":")[0]?.toLowerCase();
  return ({
    service: "Service listing",
    job: "Job listing",
    project: "Project",
    cancel_project: "Project",
    resolve_dispute: "Dispute",
    moderate_account: "User account",
    user: "User account",
  } as Record<string, string>)[prefix] ?? "Record";
}

function auditSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const details = value as Record<string, unknown>;
  const note = [details.resolution, details.notes, details.reason].find(
    (item): item is string => typeof item === "string" && Boolean(item.trim()),
  );
  if (note) return note.trim();
  const status = details.status;
  return typeof status === "string" && status.trim()
    ? `Status: ${status.replaceAll("_", " ")}`
    : null;
}

export default function AdminDashboard() {
  const [results, setResults] = useState<
    Partial<Record<AdminModule, FeedState>>
  >({});
  const [loading, setLoading] = useState(true);
  const [actionCounts, setActionCounts] = useState<AdminQuickActionCounts | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    const modules: AdminModule[] = [
      ...feeds.map((feed) => feed.module),
      ...reviewModules,
    ];
    const [values, counts] = await Promise.all([
      Promise.all(modules.map(async (module) => {
        try {
          return [
            module,
            { data: await getAdminRecords(module, "", 0) },
          ] as const;
        } catch (error) {
          return [
            module,
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to load this section.",
            },
          ] as const;
        }
      })),
      getAdminQuickActionCounts().catch(() => null),
    ]);
    if (request === sequence.current) {
      setResults(Object.fromEntries(values));
      setActionCounts(counts);
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const requests = sequence;
    const timer = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer);
      requests.current++;
    };
  }, [load]);
  const stats = results.overview?.data?.stats;
  const projectCounts = (results.projects?.data?.rows ?? []).reduce<
    Record<string, number>
  >((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});
  const transactionCounts = (results.transactions?.data?.rows ?? []).reduce<
    Record<string, number>
  >((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});
  const actionCountUnavailable = !actionCounts ||
    Object.values(actionCounts).some((count) => count === null);
  const quickActions = [
    {
      label: "Transactions",
      href: "/admin/financial",
      Icon: Wallet,
      pendingCount: actionCounts?.transactions ?? null,
    },
    {
      label: "Verification",
      href: "/admin/verification",
      Icon: ShieldCheck,
      pendingCount: actionCounts?.verification ?? null,
    },
    {
      label: "Reports",
      href: "/admin/reports",
      Icon: ClipboardCheck,
      pendingCount: actionCounts?.reports ?? null,
    },
    {
      label: "Disputes",
      href: "/admin/disputes",
      Icon: Scale,
      pendingCount: actionCounts?.disputes ?? null,
    },
    {
      label: "Listing moderation",
      href: "/admin/moderation",
      Icon: Store,
      pendingCount: actionCounts?.listingModeration ?? null,
    },
    {
      label: "Tax documents & declarations",
      href: "/admin/financial/tax",
      Icon: ClipboardCheck,
      pendingCount: actionCounts?.sellerTaxReview ?? null,
    },
    {
      label: "Analytics",
      href: "/admin/analytics",
      Icon: ChartNoAxesCombined,
      pendingCount: 0,
    },
    {
      label: "Audit history",
      href: "/admin/audit",
      Icon: ScrollText,
      pendingCount: 0,
    },
  ]
    .map((action, index) => ({ ...action, index }))
    .sort(
      (left, right) =>
        (right.pendingCount ?? -1) - (left.pendingCount ?? -1) ||
        left.index - right.index,
    );
  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Dashboard"
        description="Monitor marketplace activity, review important queues, and open admin tools."
      />
      {loading ? (
        <ContentSkeleton
          label="Loading admin dashboard"
          variant="admin-dashboard"
        />
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
              {["freelancers", "clients", "active_projects", "open_jobs"]
                .filter((key) => typeof stats[key] === "number")
                .map((key, index) => (
                  <AdminMetricCard
                    key={key}
                    label={key}
                    value={stats[key]}
                    index={index}
                  />
                ))}
            </div>
          )}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Quick actions</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Open common admin workspaces.
                </p>
                {actionCountUnavailable && (
                  <p role="status" className="mt-1 text-xs text-muted-foreground">
                    Some pending counts could not be loaded. Open those workspaces to check their queues.
                  </p>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {quickActions.map(({ label, href, Icon, pendingCount }) => (
                <Button
                  key={href}
                  variant="outline"
                  asChild
                  className={`min-w-fit flex-1${pendingCount != null && pendingCount > 0 ? " gap-2" : ""}`}
                >
                  <Link
                    href={href}
                    aria-label={
                      pendingCount != null && pendingCount > 0
                        ? `${label}, ${pendingCount} items need attention`
                        : label
                    }
                    title={
                      pendingCount != null && pendingCount > 0
                        ? `${pendingCount} items need attention`
                        : undefined
                    }
                  >
                    <Icon className="size-4" />
                    {label}
                    {pendingCount != null && pendingCount > 0 ? (
                      <span aria-hidden="true" className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-destructive">
                        <span className="size-2 rounded-full bg-destructive" />
                        {pendingCount}
                      </span>
                    ) : null}
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Active review queues</CardTitle>
              <p className="text-sm text-muted-foreground">
                Recent disputes, listing reports, and verification requests.
              </p>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="disputes" className="w-full">
                <TabsList>
                  <TabsTrigger value="disputes">Disputes</TabsTrigger>
                  <TabsTrigger value="reports">Reports</TabsTrigger>
                  <TabsTrigger value="verification">Verification</TabsTrigger>
                </TabsList>
                {reviewModules.map((module) => {
                  const queue = results[module];
                  return (
                    <TabsContent key={module} value={module} className="mt-3">
                      {queue?.error ? (
                        <p
                          role="alert"
                          className="py-5 text-sm text-destructive"
                        >
                          {queue.error}
                        </p>
                      ) : queue?.data?.rows.length ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Item</TableHead>
                              <TableHead className="hidden md:table-cell">
                                Details
                              </TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="hidden sm:table-cell">
                                Submitted
                              </TableHead>
                              <TableHead>
                                <span className="sr-only">Action</span>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {queue.data.rows.slice(0, 5).map((row) => (
                              <TableRow key={row.id}>
                                <TableCell className="max-w-52 truncate font-medium">
                                  {row.title}
                                </TableCell>
                                <TableCell className="hidden max-w-80 truncate text-muted-foreground md:table-cell">
                                  {row.detail}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="secondary"
                                    className="capitalize"
                                  >
                                    {row.status.replaceAll("_", " ")}
                                  </Badge>
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">
                                  {row.created_at
                                    ? new Date(
                                        row.created_at,
                                      ).toLocaleDateString()
                                    : "—"}
                                </TableCell>
                                <TableCell>
                                  <Button variant="outline" size="sm" asChild>
                                    <Link href={`/admin/${module}`}>
                                      Review
                                    </Link>
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          No items in this queue.
                        </p>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            </CardContent>
          </Card>
          <section
            className="space-y-3"
            aria-labelledby="dashboard-charts-title"
          >
            <div>
              <h2 id="dashboard-charts-title" className="text-lg font-semibold">
                Financial & delivery snapshot
              </h2>
              <p className="text-sm text-muted-foreground">
                Recent transaction statuses and project delivery progress.
              </p>
            </div>
            <div className="grid items-start gap-6 xl:grid-cols-2">
              {results.transactions?.data ? (
                <AdminStatusChart
                  title="Recent transactions by status"
                  description="Status distribution of the latest loaded transaction records, not all transactions."
                  counts={transactionCounts}
                  variant="donut"
                />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Recent transactions by status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p role="alert" className="text-sm text-destructive">
                      {results.transactions?.error ||
                        "Transaction snapshot unavailable."}
                    </p>
                  </CardContent>
                </Card>
              )}
              {results.projects?.data ? (
                <AdminStatusChart
                  title="Project delivery status"
                  description="Status distribution of the latest loaded projects, not all projects."
                  counts={projectCounts}
                  variant="donut"
                />
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p role="alert">
                      {results.projects?.error ||
                        "Project snapshot unavailable."}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </section>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Activity className="size-5" />
                </span>
                <div className="min-w-0">
                  <CardTitle>Recent admin activity</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A clear record of recent moderation and project actions.
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link href="/admin/audit">
                  View history <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {results.overview?.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {results.overview.error}
                </p>
              ) : results.overview?.data?.rows.length ? (
                <ul className="space-y-2">
                  {results.overview.data.rows.slice(0, 5).map((row) => (
                    <li key={row.id}>
                      <Link
                        href={`/admin/audit?record=${encodeURIComponent(row.id)}`}
                        className="block rounded-xl border bg-muted/20 p-3 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
                        aria-label={`View audit details: ${auditActionLabel(row.title)}`}
                      >
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{auditActionLabel(row.title)}</p>
                          <Badge variant="secondary" className="font-normal">
                            {auditTargetLabel(row.title)}
                          </Badge>
                        </div>
                        <time className="shrink-0 text-xs text-muted-foreground">
                          {row.created_at
                            ? new Date(row.created_at).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })
                            : "Date unavailable"}
                        </time>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        By <span className="font-medium text-foreground">{row.owner_name || "Administrator"}</span>
                        <span className="mx-1.5">·</span>
                        Target: <span className="font-medium text-foreground">{row.target_name || auditTargetLabel(row.title)}</span>
                      </p>
                      {auditSummary(row.audit_details) && (
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                          {auditSummary(row.audit_details)}
                        </p>
                      )}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-5 text-sm text-muted-foreground">
                  No recent audit activity.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
