"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { MetricTrendCard } from "./MetricTrendCard";
import { StatusRadialChart } from "./StatusRadialChart";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  ChartNoAxesCombined,
  CheckCheck,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useWorkAnalytics } from "@/hooks/dashboard/useWorkAnalytics";
import {
  dateKey,
  growth,
  inPeriod,
  monthlyAnalytics,
  previousPeriod,
  summarize,
  trendAnalytics,
  type PaymentMap,
  type WorkProject,
} from "@/lib/workAnalytics";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ContentSkeleton from "@/components/shared/ContentSkeleton";

const money = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
const palette = {
  active: "var(--chart-1)",
  completed: "var(--chart-2)",
  waiting: "var(--chart-3)",
  closed: "var(--chart-5)",
  neutral: "#94a3b8",
  spending: "var(--chart-4)",
};
const tooltipStyle = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: 12,
};
const tick = { fill: "var(--muted-foreground)", fontSize: 12 };
function period(days: number) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - days + 1);
  return { from: dateKey(start), to: dateKey(today) };
}
function statusGroup(status: string) {
  if (status === "completed")
    return { name: "Completed", color: palette.completed };
  if (
    ["active", "in_progress", "revision", "revision_requested"].includes(status)
  )
    return { name: "Active / revision", color: palette.active };
  if (["cancelled", "rejected"].includes(status))
    return { name: "Cancelled / rejected", color: palette.closed };
  if (["disputed", "dispute"].includes(status))
    return { name: "Disputed", color: palette.closed };
  if (
    [
      "pending",
      "requested",
      "accepted",
      "converted",
      "pending_agreement",
    ].includes(status)
  )
    return { name: "Awaiting agreement", color: palette.waiting };
  return { name: "Other", color: palette.neutral };
}
function Panel({
  title,
  description,
  className = "",
  children,
}: {
  title: string;
  description: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={`min-w-0 gap-6 py-5 ${className}`}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-muted-foreground">
      <ChartNoAxesCombined className="size-7" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
function ChartLoading() {
  return (
    <div
      role="status"
      aria-label="Loading payment analytics"
      className="flex h-60 items-end gap-3"
    >
      <span className="sr-only">Loading payment analytics</span>
      {[40, 65, 50, 85, 70, 95].map((height, i) => (
        <Skeleton key={i} className="flex-1" style={{ height: `${height}%` }} />
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const { data, role, payments, paymentLoading, error, retry } = useWorkAnalytics();
  const { from, to } = period(30);
  const party = role ?? "all";
  const valid =
    Boolean(
      from &&
      to &&
      from <= to &&
      Number.isFinite(Date.parse(from)) &&
      Number.isFinite(Date.parse(to)),
    ) && Number(to.slice(0, 4)) - Number(from.slice(0, 4)) <= 10;
  const start = valid ? from : dateKey(new Date());
  const end = valid ? to : start;
  const projects = (data?.projects ?? []).filter(
    (p) => party === "all" || p.party === party,
  );
  const summary = summarize(projects, payments, start, end);
  const previous = previousPeriod(start, end);
  const baseline = summarize(projects, payments, previous.from, previous.to);
  const trend = trendAnalytics(projects, payments, start, end);
  const months = monthlyAnalytics(projects, payments, start, end);
  const cohort = projects.filter((p) => inPeriod(p.createdAt, start, end));
  const statuses = [
    ...cohort
      .reduce((map, p) => {
        const group = statusGroup(p.status);
        map.set(group.name, {
          ...group,
          value: (map.get(group.name)?.value ?? 0) + 1,
        });
        return map;
      }, new Map<string, { name: string; color: string; value: number }>())
      .values(),
  ];
  const unavailable = projects.filter(
    (p) => payments[p.id]?.status === "unavailable",
  ).length;
  const undated = projects.filter((p) => {
    const payment = payments[p.id];
    return payment?.status === "paid" && !payment.paidAt;
  }).length;
  const missingAmounts = projects.filter((p) => {
    const payment = payments[p.id];
    return (
      payment?.status === "paid" &&
      (payment.amount == null || !Number.isFinite(Number(payment.amount)))
    );
  }).length;
  const financialReady =
    !paymentLoading && !unavailable && !undated && !missingAmounts;
  const showEarnings = role === "freelancer";
  const paymentMetric = showEarnings ? "earnings" : "spending";
  const paymentChartHasValues = trend.some(
    (point) => point[paymentMetric] > 0,
  );
  const hasActivity =
    summary.requests + summary.started + summary.completed > 0;
  const financialStatus = paymentLoading ? "Loading" : "Unavailable";
  const rows = projects.filter(
    (p) =>
      inPeriod(p.createdAt, start, end) ||
      inPeriod(p.startedAt, start, end) ||
      inPeriod(p.completedAt, start, end) ||
      (payments[p.id]?.status === "paid" &&
        inPeriod((payments[p.id] as { paidAt?: string }).paidAt, start, end)),
  );
  const types = ["standard", "milestone"].map((type) => ({
    name: type === "standard" ? "Standard" : "Milestone",
    requests: cohort.filter((p) => p.type === type).length,
  }));
  const stats = [
    {
      key: "started" as const,
      color: palette.active,
      title: "Projects started",
      value: String(summary.started),
      detail: growth(summary.started, baseline.started),
      Icon: Activity,
      financial: false,
    },
    {
      key: "completed" as const,
      color: palette.completed,
      title: "Projects completed",
      value: String(summary.completed),
      detail: growth(summary.completed, baseline.completed),
      Icon: CheckCheck,
      financial: false,
    },
    {
      key: "earnings" as const,
      color: palette.waiting,
      title: "Gross earnings",
      value: financialReady ? money(summary.earnings) : financialStatus,
      detail: financialReady
        ? growth(summary.earnings, baseline.earnings)
        : "Confirmed freelance payments",
      Icon: ArrowDownLeft,
      financial: true,
    },
    {
      key: "spending" as const,
      color: palette.spending,
      title: "Client spending",
      value: financialReady ? money(summary.spending) : financialStatus,
      detail: financialReady
        ? growth(summary.spending, baseline.spending)
        : "Payments for work you commissioned",
      Icon: Wallet,
      financial: true,
    },
  ].filter(({ key }) =>
    key === "started" || key === "completed" ||
    (showEarnings ? key === "earnings" : key === "spending"),
  );
  return (
    <div className="@container mx-auto w-full max-w-[1600px] space-y-6">
      <WorkspacePageHeader
        title="Analytics"
        description="Track your projects and confirmed payments over time."
      />
      {!valid ? (
        <p
          role="alert"
          className="rounded-xl border p-5 text-sm text-destructive"
        >
          Choose a valid date range of up to ten years.
        </p>
      ) : error ? (
        <Card>
          <CardContent className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button variant="outline" onClick={retry}>
              Retry analytics
            </Button>
          </CardContent>
        </Card>
      ) : !data ? (
        <ContentSkeleton variant="work-analytics" label="Loading analytics" />
      ) : (
        <>
          <section aria-label="Summary" className="space-y-3">
            <div className="grid grid-cols-12 gap-4">
              {stats.map(
                ({ key, color, title, value, detail, Icon, financial }) => (
                  <div
                    key={key}
                    className="col-span-12 @min-[480px]:col-span-6 @min-[1100px]:col-span-3"
                  >
                    <MetricTrendCard
                      title={title}
                      value={value}
                      detail={detail}
                      icon={Icon}
                      color={color}
                      points={trend.map((point) => ({
                        date: point.month,
                        value: point[key],
                      }))}
                      loading={financial && paymentLoading}
                      unavailable={financial && !financialReady}
                    />
                  </div>
                ),
              )}
            </div>
          </section>
          <section
            aria-label="Trends and breakdowns"
            className="grid grid-cols-12 gap-5"
          >
            <Panel
              title="Project activity"
              description={`Requests, starts and completions ${trend.length && trend[0].month.length === 10 ? "by day" : "by month"}.`}
              className="col-span-12 @min-[1000px]:col-span-8"
            >
              {hasActivity ? (
                <div className="h-72 sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={trend}
                      accessibilityLayer
                      margin={{ top: 12, right: 12, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tick={tick}
                        minTickGap={35}
                        tickFormatter={(v: string) =>
                          v.length === 10 ? v.slice(5) : v
                        }
                      />
                      <YAxis allowDecimals={false} tick={tick} width={40} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                      <Line
                        type="monotone"
                        dataKey="requests"
                        name="Requests"
                        stroke={palette.waiting}
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="started"
                        name="Started"
                        stroke={palette.active}
                        strokeWidth={2.5}
                        dot={trend.length < 3}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="completed"
                        name="Completed"
                        stroke={palette.completed}
                        strokeWidth={2.5}
                        dot={trend.length < 3}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty>
                  No requests, starts or completions in this period. Try a wider
                  date range.
                </Empty>
              )}
            </Panel>
            <Panel
              title="Current status"
              description="Requests created in the selected period, grouped by their status today."
              className="col-span-12 @min-[1000px]:col-span-4"
            >
              {statuses.length ? (
                <StatusRadialChart statuses={statuses} total={cohort.length} />
              ) : (
                <Empty>No requests created in this period.</Empty>
              )}
            </Panel>
            <Panel
              title={showEarnings ? "Gross earnings over time" : "Client spending over time"}
              description="Confirmed payments by date, including recorded test-mode payments."
              className="col-span-12 @min-[900px]:col-span-6"
            >
              {paymentLoading ? (
                <ChartLoading />
              ) : (
                <div>
                  {!financialReady && (
                    <p
                      role="status"
                      className="mb-3 text-xs text-muted-foreground"
                    >
                      Payment records are incomplete. This chart shows confirmed records available; summary totals remain unavailable.
                    </p>
                  )}
                  {!paymentChartHasValues ? (
                    <Empty>No confirmed payments in this period.</Empty>
                  ) : <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={trend}
                        accessibilityLayer
                        margin={{ right: 12, left: -10 }}
                      >
                        <CartesianGrid
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="month"
                          tick={tick}
                          minTickGap={40}
                          tickFormatter={(v: string) =>
                            v.length === 10 ? v.slice(5) : v
                          }
                        />
                        <YAxis
                          tick={tick}
                          width={65}
                          tickFormatter={(v) =>
                            new Intl.NumberFormat("en", {
                              notation: "compact",
                            }).format(Number(v))
                          }
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value) => money(Number(value))}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Area
                          type="monotone"
                          dataKey={paymentMetric}
                          name={showEarnings ? "Gross earnings" : "Client spending"}
                          fill={showEarnings ? palette.completed : palette.spending}
                          fillOpacity={0.08}
                          stroke={showEarnings ? palette.completed : palette.spending}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>}
                </div>
              )}{" "}
            </Panel>
            <Panel
              title="Work by project type"
              description="Compare standard and milestone requests created in this period."
              className="col-span-12 @min-[900px]:col-span-6"
            >
              {cohort.length ? (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={types}
                      layout="vertical"
                      accessibilityLayer
                      margin={{ right: 20 }}
                    >
                      <CartesianGrid
                        stroke="var(--border)"
                        horizontal={false}
                      />
                      <XAxis type="number" allowDecimals={false} tick={tick} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={80}
                        tick={tick}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                      />
                      <Bar
                        dataKey="requests"
                        name="Requests"
                        fill={palette.active}
                        maxBarSize={36}
                        radius={[0, 4, 4, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty>No project types to compare in this period.</Empty>
              )}
            </Panel>
          </section>
          <Panel
            title="Detailed activity"
            description="Inspect the records behind the charts. Agreed budgets are contract values, not earnings."
          >
            <Tabs defaultValue="projects">
              <TabsList>
                <TabsTrigger value="projects">Projects</TabsTrigger>
                <TabsTrigger value="periods">Monthly totals</TabsTrigger>
              </TabsList>
              <TabsContent value="projects">
                <ProjectRows
                  key={`${from}:${to}:${party}`}
                  rows={rows}
                  payments={payments}
                  loading={paymentLoading}
                />
              </TabsContent>
              <TabsContent value="periods">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">
                      Monthly work and payments for the selected dates and role
                    </caption>
                    <thead>
                      <tr className="border-b">
                        {[
                          "Month",
                          "Requests",
                          "Started",
                          "Completed",
                          showEarnings ? "Gross earnings" : "Client spending",
                        ].map((name) => (
                          <th
                            key={name}
                            className="whitespace-nowrap p-3 font-medium text-muted-foreground"
                          >
                            {name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {months.map((m) => (
                        <tr key={m.month} className="border-b last:border-0">
                          <td className="p-3">{m.month}</td>
                          <td className="p-3 tabular-nums">{m.requests}</td>
                          <td className="p-3 tabular-nums">{m.started}</td>
                          <td className="p-3 tabular-nums">{m.completed}</td>
                          <td className="whitespace-nowrap p-3 tabular-nums">
                            {financialReady
                              ? money(showEarnings ? m.earnings : m.spending)
                              : financialStatus}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          </Panel>
        </>
      )}
    </div>
  );
}

function ProjectRows({
  rows,
  payments,
  loading,
}: {
  rows: WorkProject[];
  payments: PaymentMap;
  loading: boolean;
}) {
  const [limit, setLimit] = useState(10);
  if (!rows.length)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No project activity in this period.
      </p>
    );
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Projects with requests, starts, completions or payments during this
            period
          </caption>
          <thead>
            <tr className="border-b">
              {[
                "Project",
                "Your role",
                "Status",
                "Agreed budget",
                "Payment",
              ].map((name) => (
                <th
                  key={name}
                  className="whitespace-nowrap p-3 font-medium text-muted-foreground"
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((p) => {
              const payment = payments[p.id];
              return (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="min-w-48 max-w-80 p-3">
                    <Link
                      href={`/home/projects/${p.type}/${p.id}`}
                      className="inline-flex items-center gap-2 font-medium hover:text-primary hover:underline"
                    >
                      {p.title}
                      <ArrowUpRight
                        className="size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                    </Link>
                  </td>
                  <td className="p-3 capitalize">{p.party}</td>
                  <td className="whitespace-nowrap p-3">
                    <span className="inline-flex items-center gap-2 capitalize">
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full"
                        style={{ backgroundColor: statusGroup(p.status).color }}
                      />
                      {p.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap p-3 tabular-nums">
                    {p.agreedBudget === null
                      ? "Not agreed"
                      : money(p.agreedBudget)}
                  </td>
                  <td className="whitespace-nowrap p-3">
                    {loading && p.projectId
                      ? "Loading"
                      : payment?.status === "paid"
                        ? `${payment.amount == null ? "Amount unavailable" : money(payment.amount)} · ${payment.mode === "test" ? "Test" : "Paid"}`
                        : (payment?.status ?? "No project payment")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          Showing {Math.min(limit, rows.length)} of {rows.length} projects
        </span>
        {limit < rows.length && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLimit((v) => v + 10)}
          >
            Show more
          </Button>
        )}
      </div>
    </>
  );
}
