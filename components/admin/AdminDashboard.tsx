"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
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
  type AdminResult,
  type AdminModule,
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
export default function AdminDashboard() {
  const [results, setResults] = useState<
    Partial<Record<AdminModule, FeedState>>
  >({});
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    const modules: AdminModule[] = [
      ...feeds.map((feed) => feed.module),
      ...reviewModules,
    ];
    const values = await Promise.all(
      modules.map(async (module) => {
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
      }),
    );
    if (request === sequence.current) {
      setResults(Object.fromEntries(values));
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
  const pendingActionCount = (module: (typeof reviewModules)[number]) => {
    const data = results[module]?.data;
    if (!data) return 0;
    const pendingStatuses = new Set([
      "pending",
      "open",
      "under_review",
      "pending_review",
      "awaiting_review",
      "submitted",
      "escalated",
    ]);
    return data.rows.filter((row) =>
      pendingStatuses.has(row.status.toLowerCase()),
    ).length;
  };
  const quickActions = [
    {
      label: "Transactions",
      href: "/admin/financial",
      Icon: Wallet,
      pendingCount: 0,
    },
    {
      label: "Verification",
      href: "/admin/verification",
      Icon: ShieldCheck,
      pendingCount: pendingActionCount(ADMIN_MODULES.verification),
    },
    {
      label: "Reports",
      href: "/admin/reports",
      Icon: ClipboardCheck,
      pendingCount: pendingActionCount(ADMIN_MODULES.reports),
    },
    {
      label: "Disputes",
      href: "/admin/disputes",
      Icon: Scale,
      pendingCount: pendingActionCount(ADMIN_MODULES.disputes),
    },
    {
      label: "Listing moderation",
      href: "/admin/moderation",
      Icon: Store,
      pendingCount: 0,
    },
    {
      label: "Seller & tax review",
      href: "/admin/financial/tax",
      Icon: ClipboardCheck,
      pendingCount: 0,
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
        (right.pendingCount ?? 0) - (left.pendingCount ?? 0) ||
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
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {quickActions.map(({ label, href, Icon, pendingCount }) => (
                <Button
                  key={href}
                  variant="outline"
                  asChild
                  className={pendingCount ? "relative pr-8" : undefined}
                >
                  <Link
                    href={href}
                    aria-label={
                      pendingCount
                        ? `${label}, ${pendingCount} pending actions in the loaded queue page`
                        : label
                    }
                    title={
                      pendingCount
                        ? `${pendingCount} pending items on the loaded queue page`
                        : undefined
                    }
                  >
                    <Icon className="size-4" />
                    {label}
                    {pendingCount ? (
                      <span
                        aria-hidden="true"
                        className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full border-2 border-background bg-destructive text-[10px] leading-none text-destructive-foreground"
                      >
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
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>System audit stream</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Latest recorded administrative and moderation activity.
                  </p>
                </div>
                <Link
                  href="/admin/audit"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View history
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {results.overview?.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {results.overview.error}
                </p>
              ) : results.overview?.data?.rows.length ? (
                <ul className="divide-y">
                  {results.overview.data.rows.slice(0, 5).map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{row.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {row.detail}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString()
                          : "Date unavailable"}
                      </span>
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
