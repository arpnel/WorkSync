"use client";
import { StyledSelect } from "@/components/ui/styled-select";

import AdminMetricCard from "./AdminMetricCard";
import AdminStatusChart from "./AdminStatusChart";
import AdminPageHeader from "./AdminPageHeader";
import { AdminFilterPanel } from "./admin-ui";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAdminAnalytics } from "@/services/admin/adminService";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type { AdminAnalyticsResult } from "@/services/admin/adminResponses";

const php = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);

export default function AdminAnalytics() {
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`),
    [to, setTo] = useState(() => new Date().toISOString().slice(0, 10)),
    [status, setStatus] = useState("all");
  const [data, setData] = useState<AdminAnalyticsResult | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const version = useRef(0);
  const [knownStatuses, setKnownStatuses] = useState<string[]>([]);
  const [paymentPeriod, setPaymentPeriod] = useState<"monthly" | "yearly">("monthly");
  const load = useCallback(async () => {
    const id = ++version.current;
    setLoading(true);
    setError("");
    try {
      if (!from || !to || from > to)
        throw new Error("Choose a valid date range.");
      const end = new Date(`${to}T00:00:00`);
      end.setDate(end.getDate() + 1);
      const result = await getAdminAnalytics(
        new Date(`${from}T00:00:00`).toISOString(),
        end.toISOString(),
        status,
      );
      if (id === version.current) {
        setData(result);
        if (result.moderation)
          setKnownStatuses((previous) =>
            Array.from(
              new Set([
                ...previous,
                ...Object.keys(result.moderation!.reports),
                ...Object.keys(result.moderation!.disputes),
              ]),
            ),
          );
      }
    } catch (e) {
      if (id === version.current) {
        setError(e instanceof Error ? e.message : "Unable to load analytics.");
        setData(null);
      }
    } finally {
      if (id === version.current) setLoading(false);
    }
  }, [from, to, status]);
  const paymentActivity = (() => {
    const monthly = data?.scope === "platform" ? data.revenue?.activity ?? [] : [];
    if (paymentPeriod === "monthly") return monthly;
    const yearly = new Map<string, { month: string; project_payments: number; premium_checkouts: number }>();
    for (const row of monthly) {
      const year = row.month.slice(0, 4);
      const total = yearly.get(year) ?? { month: year, project_payments: 0, premium_checkouts: 0 };
      total.project_payments += row.project_payments;
      total.premium_checkouts += row.premium_checkouts;
      yearly.set(year, total);
    }
    return Array.from(yearly.values());
  })();
  useEffect(() => {
    const requests = version;
    const timer = setTimeout(() => void load(), 200);
    return () => {
      clearTimeout(timer);
      requests.current++;
    };
  }, [load]);
  return (
    <div className="min-w-0 space-y-6">
      <AdminPageHeader title="Platform analytics" />
      <AdminFilterPanel ariaLabel="Filter analytics">
        <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
          <label className="grid gap-1.5 text-sm font-medium">
            From
            <Input
              className="h-10 rounded-lg bg-background font-normal"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Through
            <Input
              className="h-10 rounded-lg bg-background font-normal"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Status
            <StyledSelect
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {Array.from(
                new Set([
                  "all",
                  status,
                  ...knownStatuses,
                  ...(data?.scope === "moderation"
                    ? [
                        "suspended",
                        "hidden",
                        ...Object.keys(data.moderation.reports),
                        ...Object.keys(data.moderation.disputes),
                      ]
                    : ["pending", "active", "completed", "cancelled"]),
                ]),
              ).map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All statuses" : s.replaceAll("_", " ")}
                </option>
              ))}
            </StyledSelect>
          </label>
          <div className="flex w-full gap-2 sm:col-span-2 sm:justify-end xl:col-span-1">
            <Button
              className="h-10 flex-1 rounded-lg sm:flex-none"
              variant="ghost"
              onClick={() => {
                setFrom(`${new Date().getFullYear()}-01-01`);
                setTo(new Date().toISOString().slice(0, 10));
                setStatus("all");
              }}
            >
              Reset filters
            </Button>
            <Button
              className="h-10 flex-1 rounded-lg sm:flex-none"
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
              Refresh
            </Button>
          </div>
        </div>
        <p className="mt-4 rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {data?.scope === "moderation"
            ? "Date filters apply to users, reports, disputes, and audit actions. Status filters apply to reports, disputes, suspended accounts, and hidden listings."
            : "Dates filter records and WorkSync earnings. Project status filters project metrics and charts; earnings always use confirmed test payments."}
        </p>
      </AdminFilterPanel>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <ContentSkeleton label="Loading analytics" variant="reports" />
      ) : (
        data && (
          <>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
              {Object.entries({
                ...data.counts,
                completion_rate:
                  data.completion_rate === null
                    ? "—"
                    : `${data.completion_rate}%`,
                average_rating: data.average_rating ?? "—",
                average_project_value:
                  data.average_project_value === null
                    ? "—"
                    : `PHP ${data.average_project_value.toLocaleString()}`,
              })
                .filter(([key]) =>
                  data.scope === "platform" ||
                  !["completion_rate", "average_rating", "average_project_value"].includes(key),
                )
                .map(([key, value], index) => (
                <AdminMetricCard
                  key={key}
                  label={key}
                  value={value}
                  index={index}
                />
              ))}
            </div>
            {data.scope === "platform" && data.revenue && (
              <section className="space-y-3" aria-labelledby="worksync-earnings-title">
                <div>
                  <h2 id="worksync-earnings-title" className="text-lg font-semibold">WorkSync earnings</h2>
                  <p className="text-sm text-muted-foreground">
                    Confirmed test payments in the selected date range. Uses transaction fee snapshots and Premium taxable prices; excludes project funds and separately recorded VAT.
                  </p>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
                  {[
                    ["Total WorkSync earnings", data.revenue.total],
                    ["Transaction fees", data.revenue.transaction_fees],
                    ["Premium subscriptions", data.revenue.premium_subscriptions],
                  ].map(([label, amount], index) => (
                    <AdminMetricCard
                      key={label}
                      label={String(label)}
                      value={php(Number(amount))}
                      index={index + 4}
                    />
                  ))}
                </div>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle>Earnings by month</CardTitle>
                    <p className="text-sm text-muted-foreground">Transaction fees and Premium plan prices recorded from test-mode payments.</p>
                  </CardHeader>
                  <CardContent>
                    {data.revenue.activity.length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">No WorkSync earnings in this date range.</p>
                    ) : (
                      <div className="h-72 min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={data.revenue.activity} accessibilityLayer>
                            <XAxis dataKey="month" />
                            <YAxis tickFormatter={(value: number) => php(value)} />
                            <Tooltip formatter={(value) => php(Number(value))} />
                            <Legend />
                            <Line type="linear" strokeWidth={2.5} dataKey="transaction_fees" name="Transaction fees" stroke="var(--chart-1)" />
                            <Line type="linear" strokeWidth={2.5} dataKey="premium_subscriptions" name="Premium subscriptions" stroke="var(--chart-2)" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-2">
                    <div>
                      <CardTitle>Confirmed transactions</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">Test-mode project payments and Premium checkouts.</p>
                    </div>
                    <div className="flex gap-1 rounded-lg border p-1" aria-label="Transaction chart period">
                      {(["monthly", "yearly"] as const).map((period) => (
                        <Button
                          key={period}
                          type="button"
                          size="sm"
                          variant={paymentPeriod === period ? "secondary" : "ghost"}
                          onClick={() => setPaymentPeriod(period)}
                        >
                          {period === "monthly" ? "By month" : "By year"}
                        </Button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {paymentActivity.length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">No confirmed transactions in this date range.</p>
                    ) : (
                      <div className="h-72 min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={paymentActivity} accessibilityLayer>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Legend />
                            <Line type="linear" strokeWidth={2.5} dataKey="project_payments" name="Project payments" stroke="var(--chart-1)" />
                            <Line type="linear" strokeWidth={2.5} dataKey="premium_checkouts" name="Premium checkouts" stroke="var(--chart-2)" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>
            )}
            {data.moderation && (
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(data.moderation).map(([name, counts]) => (
                  <AdminStatusChart
                    key={name}
                    title={`${name === "reports" ? "Reports" : "Disputes"} by status`}
                    variant={name === "reports" ? "bar" : "donut"}
                    counts={counts}
                    description="Matching records for the selected dates and status."
                  />
                ))}
              </div>
            )}
            {data.activity !== null && <Card>
              <CardHeader className="pb-2">
                <CardTitle>Activity by month</CardTitle>
                <p className="text-sm text-muted-foreground">New users and projects created during the selected date range.</p>
              </CardHeader>
              <CardContent>
                {data.activity.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No monthly activity in this date range.</p>
                ) : (
                  <div className="h-72 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.activity} accessibilityLayer>
                        <XAxis dataKey="month" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Line
                          type="linear"
                          strokeWidth={2.5}
                          dataKey="users"
                          stroke="var(--chart-1)"
                        />
                        <Line
                          type="linear"
                          strokeWidth={2.5}
                          dataKey="projects"
                          stroke="var(--chart-2)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>}
            {data.categories !== null && (
              <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Top job and service categories</CardTitle>
                  <p className="text-sm text-muted-foreground">Most listings created in each category during the selected date range.</p>
                </CardHeader>
                <CardContent>
                  {data.categories.filter((category) => category.jobs + category.services > 0).length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">No job or service listings in this date range.</p>
                  ) : (
                    <div className="h-[22rem] min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[...data.categories]
                            .filter((category) => category.jobs + category.services > 0)
                            .sort((a, b) => b.jobs + b.services - a.jobs - a.services)
                            .slice(0, 10)}
                          layout="vertical"
                          margin={{ top: 8, right: 20, bottom: 8, left: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" allowDecimals={false} />
                          <YAxis type="category" dataKey="name" width={150} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="jobs" name="Jobs" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                          <Bar dataKey="services" name="Services" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="gap-0">
                <CardHeader className="border-b py-4">
                  <CardTitle>Category activity</CardTitle>
                  <p className="text-sm text-muted-foreground">Jobs and services created in each category.</p>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead>Jobs</TableHead>
                        <TableHead>Services</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.categories.length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">No category activity in this date range.</TableCell></TableRow>
                      ) : data.categories.map((c) => (
                        <TableRow key={c.name}>
                          <TableCell>{c.name}</TableCell>
                          <TableCell>{c.jobs}</TableCell>
                          <TableCell>{c.services}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              </>
            )}
          </>
        )
      )}
    </div>
  );
}
