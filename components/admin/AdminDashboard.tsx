"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  RefreshCw,
  ShieldCheck,
  Flag,
  Scale,
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
type FeedState = { data?: AdminResult; error?: string };
export default function AdminDashboard() {
  const [results, setResults] = useState<
    Partial<Record<AdminModule, FeedState>>
  >({});
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState("");
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    const values = await Promise.all(
      feeds.map(async (feed) => {
        try {
          return [
            feed.module,
            { data: await getAdminRecords(feed.module, "", 0) },
          ] as const;
        } catch (error) {
          return [
            feed.module,
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
      setUpdated(new Date().toLocaleTimeString());
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
  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Marketplace overview"
        description="Follow freelance work, monitor payments, and keep the marketplace safe."
        actions={
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            Refresh overview
          </Button>
        }
      />
      {updated && (
        <p className="text-xs text-muted-foreground">
          Last refreshed {updated}. Transaction status is a snapshot, not a live
          payment stream.
        </p>
      )}
      {loading ? (
        <ContentSkeleton label="Loading marketplace overview" variant="cards" />
      ) : (
        <>
          {stats && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Review desk</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Protect clients and freelancers with timely, documented
                  reviews.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  {
                    title: "Verification requests",
                    description:
                      "Review identity checks before approving accounts.",
                    href: "/admin/verification",
                    Icon: ShieldCheck,
                  },
                  {
                    title: "Reported listings",
                    description:
                      stats?.pending_reports == null
                        ? "Investigate flagged jobs and services."
                        : stats.pending_reports +
                          " reports awaiting attention.",
                    href: "/admin/reports",
                    Icon: Flag,
                  },
                  {
                    title: "Project disputes",
                    description:
                      "Review evidence and help resolve delivery disagreements.",
                    href: "/admin/disputes",
                    Icon: Scale,
                  },
                ].map(({ title, description, href, Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {title}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {description}
                      </span>
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </CardContent>
            </Card>
            {results.projects?.data ? (
              <AdminStatusChart
                title="Project delivery snapshot"
                description="Status distribution of the latest loaded projects, not all projects."
                counts={projectCounts}
                variant="donut"
              />
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <p role="alert">
                    {results.projects?.error || "Project snapshot unavailable."}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
          <div className="grid items-start gap-6 xl:grid-cols-2">
            {feeds.map((feed) => (
              <Card key={feed.module}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle>{feed.title}</CardTitle>
                    <Link
                      href={feed.href}
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                    >
                      View all<span className="sr-only"> {feed.title}</span>
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {feed.description}
                  </p>
                </CardHeader>
                <CardContent>
                  {results[feed.module]?.error ? (
                    <p role="alert" className="text-sm text-destructive">
                      {results[feed.module]?.error}
                    </p>
                  ) : !results[feed.module]?.data?.rows.length ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No records yet.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {results[feed.module]?.data?.rows
                        .slice(0, 5)
                        .map((row) => (
                          <li
                            key={row.id}
                            className="py-4 first:pt-0 last:pb-0"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <p className="min-w-0 flex-1 break-words text-sm font-medium">
                                {row.title}
                              </p>
                              <Badge variant="secondary" className="capitalize">
                                {row.status.replaceAll("_", " ")}
                              </Badge>
                            </div>
                            <p className="mt-2 line-clamp-2 whitespace-pre-line break-words text-xs text-muted-foreground">
                              {row.detail}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {row.created_at
                                ? new Date(row.created_at).toLocaleDateString()
                                : "Date unavailable"}
                            </p>
                          </li>
                        ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
