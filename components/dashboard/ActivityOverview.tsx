"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { projectHref } from "@/lib/projectNavigation";
import {
  BriefcaseBusiness,
  CircleCheck,
  Clock3,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getDashboardActivity,
  type DashboardActivity,
} from "@/services/dashboard/dashboardService";

const tones = {
  blue: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300",
  green:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
  amber:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
  violet:
    "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300",
  rose: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300",
};

function ProjectStatus({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? tones.green
      : ["active", "in_progress"].includes(status)
        ? tones.blue
        : ["pending", "requested", "revision"].includes(status)
          ? tones.amber
          : ["accepted", "in_discussion"].includes(status)
            ? tones.violet
            : ["cancelled", "canceled", "rejected", "disputed"].includes(status)
              ? tones.rose
              : "border-border bg-muted text-muted-foreground";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] font-medium capitalize ${tone}`}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full bg-current"
      />
      {status.replaceAll("_", " ")}
    </span>
  );
}

export default function ActivityOverview({
  reports = false,
  charts,
  tools,
}: {
  reports?: boolean;
  charts?: (activity: ReactNode) => ReactNode;
  tools?: ReactNode;
}) {
  const [data, setData] = useState<DashboardActivity | null>(null);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const load = useCallback(async () => {
    try {
      const next = await getDashboardActivity();
      setData(next);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load activity.",
      );
    }
  }, []);
  useEffect(() => {
    let alive = true;
    void getDashboardActivity()
      .then((next) => {
        if (alive) setData(next);
      })
      .catch((cause) => {
        if (alive)
          setError(
            cause instanceof Error ? cause.message : "Unable to load activity.",
          );
      });
    return () => {
      alive = false;
    };
  }, []);
  if (error)
    return (
      <div role="alert" className="space-y-3">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  if (!data)
    return (
      <ContentSkeleton
        label="Loading your activity"
        variant={tools ? "dashboard" : "reports"}
      />
    );
  const projects = data.projects.filter(
    (project) =>
      (!from || project.createdAt.slice(0, 10) >= from) &&
      (!to || project.createdAt.slice(0, 10) <= to),
  );
  const completed = projects.filter((p) => p.status === "completed").length;
  const stats = [
    {
      title: "Active projects",
      href: projectHref("active"),
      tone: tones.blue,
      icon: BriefcaseBusiness,
      value: projects.filter((p) =>
        ["active", "in_progress", "revision"].includes(p.status),
      ).length,
    },
    {
      title: "Completed projects",
      href: projectHref("completed"),
      value: completed,
      tone: tones.green,
      icon: CircleCheck,
    },
    {
      title: "Pending requests",
      href: projectHref("request"),
      tone: tones.amber,
      icon: Clock3,
      value: projects.filter((p) => ["pending", "requested"].includes(p.status))
        .length,
    },
    {
      title: "Your listings",
      href: "/home/my-listings",
      value: data.listings.length,
      tone: tones.violet,
      icon: LayoutGrid,
    },
  ];
  const projectActivity = (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-[clamp(1.125rem,1rem+0.3vw,1.375rem)]">
          Project activity
        </CardTitle>
        <CardDescription className="text-[clamp(0.875rem,0.75rem+0.3vw,1rem)]">
          Your projects, current status, and deadlines. Budgets are agreed
          contract values.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {projects.length ? (
          <>
            <div className="space-y-3 md:hidden">
              {projects.map((p) => (
                <article
                  key={p.id}
                  className="rounded-xl border bg-muted/20 p-4"
                >
                  <Link
                    className="break-words font-semibold text-primary hover:underline"
                    href={`/home/projects/${p.type}/${p.id}`}
                  >
                    {p.title}
                  </Link>
                  <div className="mt-2">
                    <ProjectStatus status={p.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-[clamp(0.875rem,0.75rem+0.3vw,1rem)]">
                    <div>
                      <dt className="text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] text-muted-foreground">
                        Budget (PHP)
                      </dt>
                      <dd className="mt-1 break-words">
                        {p.agreedBudget === null
                          ? "Not agreed"
                          : p.agreedBudget.toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] text-muted-foreground">
                        Deadline
                      </dt>
                      <dd className="mt-1">
                        {p.dueDate
                          ? new Date(p.dueDate).toLocaleDateString()
                          : "Not agreed"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <div className="hidden md:block">
              <Table className="text-[clamp(0.875rem,0.75rem+0.3vw,1rem)]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Budget (PHP)</TableHead>
                    <TableHead>Deadline</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link
                          className="underline"
                          href={`/home/projects/${p.type}/${p.id}`}
                        >
                          {p.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <ProjectStatus status={p.status} />
                      </TableCell>
                      <TableCell>
                        {p.agreedBudget === null
                          ? "Not agreed"
                          : p.agreedBudget.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {p.dueDate
                          ? new Date(p.dueDate).toLocaleDateString()
                          : "Not agreed"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <p className="text-[clamp(0.875rem,0.75rem+0.3vw,1rem)] text-muted-foreground">
            No projects in this period.
          </p>
        )}
        {reports && (
          <p
            className={`mt-4 rounded-lg border px-4 py-3 text-[clamp(0.875rem,0.75rem+0.3vw,1rem)] font-medium ${tones.green}`}
          >
            Completion rate:{" "}
            {projects.length
              ? Math.round((completed / projects.length) * 100)
              : 0}
            % of listed requests/projects.
          </p>
        )}
      </CardContent>
    </Card>
  );
  const recentNotifications = (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-[clamp(1.125rem,1rem+0.3vw,1.375rem)]">
          Recent notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {data.notifications.slice(0, 5).map((n) => (
          <div key={n.id} className="py-3">
            <p className="text-[clamp(0.875rem,0.75rem+0.3vw,1rem)] font-medium">
              {n.title}
            </p>
            <p className="text-[clamp(0.875rem,0.75rem+0.3vw,1rem)] text-muted-foreground">
              {n.description}
            </p>
            <time className="text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] text-muted-foreground">
              {new Date(n.createdAt).toLocaleString()}
            </time>
          </div>
        ))}
        {!data.notifications.length && (
          <p className="text-[clamp(0.875rem,0.75rem+0.3vw,1rem)] text-muted-foreground">
            No activity yet.
          </p>
        )}
        <Link
          className="mt-3 block text-[clamp(0.875rem,0.75rem+0.3vw,1rem)] underline"
          href="/home/notifications"
        >
          View notifications
        </Link>
      </CardContent>
    </Card>
  );
  return (
    <div
      className={
        tools
          ? "grid min-w-0 grid-cols-12 gap-6 items-start @min-[900px]:grid-cols-[minmax(0,1fr)_320px]"
          : "space-y-5"
      }
    >
      {reports && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[clamp(0.875rem,0.75rem+0.3vw,1rem)]">
            Created from
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-[clamp(0.875rem,0.75rem+0.3vw,1rem)]">
            Through
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <Button
            variant="ghost"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Clear
          </Button>
        </div>
      )}
      <section
        aria-label="Workspace summary"
        className="col-span-12 grid gap-4 @min-[560px]:grid-cols-2 @min-[1200px]:grid-cols-4 @min-[900px]:col-span-1 @min-[900px]:col-start-1"
      >
        {stats.map((stat) => (
          <Link
            key={stat.title}
            href={stat.href}
            className="group rounded-2xl outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Card className="h-full shadow-sm transition-colors group-hover:bg-accent/50">
              <CardContent>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[clamp(0.875rem,0.625rem+0.6vw,1.125rem)] leading-snug font-medium dark:text-muted-foreground">
                    {stat.title}
                  </p>
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${stat.tone}`}
                  >
                    <stat.icon
                      aria-hidden="true"
                      className="size-4 shrink-0 2xl:size-5"
                    />
                  </span>
                </div>
                <p className="mt-2 text-[clamp(1.75rem,1.25rem+1vw,2.5rem)] leading-tight font-semibold">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
      {charts && (
        <div className="col-span-12 min-w-0 @min-[900px]:col-span-1 @min-[900px]:col-start-1">
          {charts(projectActivity)}
        </div>
      )}
      {!tools && recentNotifications}
      {tools && (
        <aside
          aria-label="Schedule, quick actions, and recent notifications"
          className="col-span-12 min-w-0 space-y-5 @min-[900px]:col-span-1 @min-[900px]:col-start-2 @min-[900px]:row-start-1 @min-[900px]:row-span-2"
        >
          {tools}
          {recentNotifications}
        </aside>
      )}
      {!charts && projectActivity}
    </div>
  );
}
