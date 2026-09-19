"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { projectHref } from "@/lib/projectNavigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
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
} from "@/lib/workAnalytics";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const money = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
const colors = [
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#a78bfa",
  "#fb7185",
  "#94a3b8",
];
const tooltipStyle = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: 12,
};
const statusName = (status: string) =>
  ({
    completed: "Completed",
    active: "Active",
    revision: "Revision",
    pending: "Request",
    requested: "Request",
    accepted: "In discussion",
    converted: "Agreement",
    cancelled: "Cancelled",
    rejected: "Rejected",
  })[status] ?? status.replaceAll("_", " ");

export default function WorkAnalytics({
  reports = false,
  projectActivity,
}: {
  reports?: boolean;
  projectActivity?: ReactNode;
}) {
  const router = useRouter();
  const { data, payments, paymentLoading, error, retry } = useWorkAnalytics();
  const [party, setParty] = useState("all");
  const [from, setFrom] = useState(() => {
    const date = new Date();
    return dateKey(new Date(date.getFullYear(), date.getMonth() - 5, 1));
  });
  const [to, setTo] = useState(() => dateKey(new Date()));

  if (error)
    return (
      <div role="alert" className="space-y-3">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={retry}>
          Retry
        </Button>
      </div>
    );
  if (!data)
    return (
      <ContentSkeleton
        label="Loading analytics"
        variant={reports ? "reports" : "dashboard-charts"}
      />
    );
  const valid =
    Boolean(
      from &&
      to &&
      from <= to &&
      Number.isFinite(Date.parse(from)) &&
      Number.isFinite(Date.parse(to)),
    ) && Number(to.slice(0, 4)) - Number(from.slice(0, 4)) <= 10;
  const projects = data.projects.filter(
    (p) => party === "all" || p.party === party,
  );
  const start = valid ? from : dateKey(new Date());
  const end = valid ? to : start;
  const summary = summarize(projects, payments, start, end);
  const previous = previousPeriod(start, end);
  const baseline = summarize(projects, payments, previous.from, previous.to);
  const months = monthlyAnalytics(projects, payments, start, end);
  const cohort = projects.filter((p) => inPeriod(p.createdAt, start, end));
  const statuses = Object.entries(
    cohort.reduce<Record<string, number>>((acc, p) => {
      const name = statusName(p.status);
      acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));
  const unavailable = projects.filter(
    (p) => payments[p.id]?.status === "unavailable",
  ).length;
  const undated = projects.filter((p) => {
    const payment = payments[p.id];
    return payment?.status === "paid" && !payment.paidAt;
  }).length;
  const financialReady = !paymentLoading && !unavailable && !undated;
  const rows = projects.filter(
    (p) =>
      inPeriod(p.createdAt, start, end) ||
      inPeriod(p.startedAt, start, end) ||
      inPeriod(p.completedAt, start, end) ||
      (payments[p.id]?.status === "paid" &&
        inPeriod((payments[p.id] as { paidAt?: string }).paidAt, start, end)),
  );

  return (
    <div className="@container space-y-6 text-sm 2xl:text-base">
      {reports ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            From
            <Input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            Through
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            Work as
            <select
              className="block h-10 rounded-lg border bg-card px-3"
              value={party}
              onChange={(e) => setParty(e.target.value)}
            >
              <option value="all">All roles</option>
              <option value="freelancer">Freelancer</option>
              <option value="client">Client</option>
            </select>
          </label>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Work overview</h2>
          <p className="text-xs text-muted-foreground">
            Last six calendar months, through today
          </p>
        </div>
      )}
      {!valid ? (
        <p role="alert" className="text-destructive">
          Choose a valid date range of up to ten years.
        </p>
      ) : (
        <>
          {reports && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    title: "Gross earnings",
                    value: financialReady
                      ? money(summary.earnings)
                      : "Unavailable",
                    detail: financialReady
                      ? growth(summary.earnings, baseline.earnings)
                      : "Payment data is loading or incomplete",
                    color: "text-emerald-700 dark:text-emerald-300",
                  },
                  {
                    title: "Client spending",
                    value: financialReady
                      ? money(summary.spending)
                      : "Unavailable",
                    detail: financialReady
                      ? growth(summary.spending, baseline.spending)
                      : "Payment data is loading or incomplete",
                    color: "text-violet-700 dark:text-violet-300",
                  },
                  {
                    title: "Projects started",
                    value: summary.started,
                    detail: growth(summary.started, baseline.started),
                    color: "text-blue-700 dark:text-blue-300",
                  },
                  {
                    title: "Projects completed",
                    value: summary.completed,
                    detail: growth(summary.completed, baseline.completed),
                    color: "text-emerald-700 dark:text-emerald-300",
                  },
                ].map((stat) => (
                  <Card key={stat.title}>
                    <CardContent className="space-y-2 pt-2">
                      <p className="text-sm 2xl:text-base text-muted-foreground">
                        {stat.title}
                      </p>
                      <p
                        className={`text-2xl font-semibold 2xl:text-3xl ${stat.color}`}
                      >
                        {stat.value}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {stat.detail}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <p className="text-muted-foreground">
                Compared with {previous.from} to {previous.to}, an equally long
                period. Gross earnings are confirmed live client payments for
                your freelance work, before fees and expenses; they are not net
                profit or a payout balance.
              </p>
            </>
          )}
          <div className="grid min-w-0 gap-5 @min-[640px]:grid-cols-2">
            <Card className="order-2 min-w-0">
              <CardHeader>
                <CardTitle>
                  <Link
                    href="/home/projects"
                    className="hover:text-primary hover:underline"
                  >
                    Project status
                  </Link>
                </CardTitle>
                <CardDescription>
                  Current status of requests created in this period.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {statuses.length ? (
                  <>
                    <div className="h-56 sm:h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={statuses}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="50%"
                            outerRadius="75%"
                            paddingAngle={3}
                            cursor="pointer"
                            onClick={(entry) =>
                              router.push(projectHref(String(entry.name ?? "")))
                            }
                            isAnimationActive={false}
                          >
                            {statuses.map((s) => (
                              <Cell
                                key={s.name}
                                fill={
                                  s.name === "Completed"
                                    ? colors[1]
                                    : s.name === "Active"
                                      ? colors[0]
                                      : s.name === "Request"
                                        ? colors[2]
                                        : s.name === "In discussion"
                                          ? colors[3]
                                          : s.name === "Cancelled" ||
                                              s.name === "Rejected"
                                            ? colors[4]
                                            : colors[5]
                                }
                              />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2">
                      {statuses.map((s) => (
                        <li key={s.name}>
                          <Link
                            href={projectHref(s.name)}
                            className="hover:text-primary hover:underline"
                          >
                            {s.name}: <strong>{s.value}</strong>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="py-20 text-center text-muted-foreground">
                    No requests created in this period.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="order-1 min-w-0 @min-[640px]:col-span-2">
              <CardHeader>
                <CardTitle>
                  <Link
                    href="/home/analytics"
                    className="hover:text-primary hover:underline"
                  >
                    Work growth
                  </Link>
                </CardTitle>
                <CardDescription>
                  Requests received or sent, project starts, and completions by
                  month.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={months} accessibilityLayer>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: "var(--muted-foreground)" }}
                        width={35}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend
                        content={() => (
                          <nav
                            aria-label="Explore work activity"
                            className="flex flex-wrap justify-center gap-4 text-sm"
                          >
                            {[
                              ["Requests", "request"],
                              ["Started", "active"],
                              ["Completed", "completed"],
                            ].map(([label, status]) => (
                              <Link
                                key={status}
                                href={projectHref(status)}
                                className="hover:text-primary hover:underline"
                              >
                                <span
                                  aria-hidden="true"
                                  className="mr-1.5 inline-block size-2 rounded-sm"
                                  style={{
                                    backgroundColor:
                                      status === "request"
                                        ? colors[2]
                                        : status === "active"
                                          ? colors[0]
                                          : colors[1],
                                  }}
                                />
                                {label}
                              </Link>
                            ))}
                          </nav>
                        )}
                      />
                      <Bar
                        dataKey="requests"
                        cursor="pointer"
                        onClick={() => router.push(projectHref("request"))}
                        name="Requests"
                        fill={colors[2]}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="started"
                        cursor="pointer"
                        onClick={() => router.push(projectHref("active"))}
                        name="Started"
                        fill={colors[0]}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="completed"
                        cursor="pointer"
                        onClick={() => router.push(projectHref("completed"))}
                        name="Completed"
                        fill={colors[1]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card className="order-3 min-w-0">
              <CardHeader>
                <CardTitle>
                  <Link
                    href="/home/analytics"
                    className="hover:text-primary hover:underline"
                  >
                    Earnings & spending
                  </Link>
                </CardTitle>
                <CardDescription>
                  Confirmed live payments in PHP, grouped by payment date. Test
                  payments are excluded.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {paymentLoading ? (
                  <ContentSkeleton
                    label="Loading payment analytics"
                    count={1}
                  />
                ) : !financialReady ? (
                  <p role="status" className="py-8 text-muted-foreground">
                    Payment analytics are incomplete: {unavailable} project
                    payments could not be verified; {undated} paid records have
                    no payment date. Work analytics remain available.
                  </p>
                ) : (
                  <div className="h-64 sm:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={months} accessibilityLayer>
                        <CartesianGrid
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="month"
                          tick={{
                            fill: "var(--muted-foreground)",
                            fontSize: 12,
                          }}
                        />
                        <YAxis
                          tick={{ fill: "var(--muted-foreground)" }}
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
                        <Legend
                          content={() => (
                            <nav
                              aria-label="Explore payment analytics"
                              className="flex flex-wrap justify-center gap-4 text-sm"
                            >
                              <Link
                                href="/home/analytics"
                                className="hover:text-primary hover:underline"
                              >
                                <span
                                  aria-hidden="true"
                                  className="mr-1.5 inline-block size-2 rounded-sm"
                                  style={{ backgroundColor: colors[1] }}
                                />
                                Gross earnings
                              </Link>
                              <Link
                                href="/home/analytics"
                                className="hover:text-primary hover:underline"
                              >
                                <span
                                  aria-hidden="true"
                                  className="mr-1.5 inline-block size-2 rounded-sm"
                                  style={{ backgroundColor: colors[3] }}
                                />
                                Client spending
                              </Link>
                            </nav>
                          )}
                        />
                        <Bar
                          dataKey="earnings"
                          cursor="pointer"
                          onClick={() => router.push("/home/analytics")}
                          name="Gross earnings"
                          fill={colors[1]}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="spending"
                          cursor="pointer"
                          onClick={() => router.push("/home/analytics")}
                          name="Client spending"
                          fill={colors[3]}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {!paymentLoading && summary.testPayments > 0 && (
                  <p className="mt-3 text-muted-foreground">
                    Test payments in this period: {money(summary.testPayments)}.
                    These are simulated transactions.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
          {projectActivity}
          {reports && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Performance details</CardTitle>
                  <CardDescription>
                    Starts use project start dates; completions use recorded
                    completion dates.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p>
                    {summary.requests} requests created.{" "}
                    {summary.completionRate === null
                      ? "No requests to calculate a completion rate."
                      : `${summary.completionRate.toFixed(1)}% of these requests are now completed.`}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm 2xl:text-base">
                      <caption className="sr-only">
                        Monthly work and payment breakdown
                      </caption>
                      <thead>
                        <tr className="border-b">
                          {[
                            "Month",
                            "Requests",
                            "Started",
                            "Completed",
                            "Gross earnings",
                            "Client spending",
                          ].map((h) => (
                            <th
                              key={h}
                              className="whitespace-nowrap p-3 font-medium"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {months.map((m) => (
                          <tr key={m.month} className="border-b">
                            <td className="p-3">{m.month}</td>
                            <td className="p-3">{m.requests}</td>
                            <td className="p-3">{m.started}</td>
                            <td className="p-3">{m.completed}</td>
                            <td className="p-3">
                              {financialReady
                                ? money(m.earnings)
                                : "Unavailable"}
                            </td>
                            <td className="p-3">
                              {financialReady
                                ? money(m.spending)
                                : "Unavailable"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Project breakdown</CardTitle>
                  <CardDescription>
                    Projects with requests, starts, completions, or payments in
                    this period. Agreed budgets are contract values, not
                    earnings.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm 2xl:text-base">
                      <thead>
                        <tr className="border-b">
                          {[
                            "Project",
                            "Your role",
                            "Status",
                            "Agreed budget",
                            "Payment",
                          ].map((h) => (
                            <th
                              key={h}
                              className="whitespace-nowrap p-3 font-medium"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((p) => {
                          const payment = payments[p.id];
                          return (
                            <tr key={p.id} className="border-b">
                              <td className="min-w-48 p-3">
                                <Link
                                  className="font-medium text-primary hover:underline"
                                  href={`/home/projects/${p.type}/${p.id}`}
                                >
                                  {p.title}
                                </Link>
                              </td>
                              <td className="p-3 capitalize">{p.party}</td>
                              <td className="p-3">{statusName(p.status)}</td>
                              <td className="p-3">
                                {p.agreedBudget === null
                                  ? "Not agreed"
                                  : money(p.agreedBudget)}
                              </td>
                              <td className="p-3">
                                {paymentLoading && p.projectId
                                  ? "Loading"
                                  : payment?.status === "paid"
                                    ? `${money(payment.amount ?? 0)} (${payment.mode})`
                                    : (payment?.status ?? "No project payment")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!rows.length && (
                    <p className="py-5 text-muted-foreground">
                      No project activity in this period.
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
