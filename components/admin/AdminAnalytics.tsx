"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import AdminPageHeader from "./AdminPageHeader";
import { AdminFilterPanel } from "./admin-ui";
import { getAdminAnalytics } from "@/services/admin/adminService";
import type { AdminAnalyticsResult } from "@/services/admin/adminResponses";
import { CalendarDays, RefreshCw, RotateCcw } from "lucide-react";

type Point = Record<string, string | number>;
type Series = { key: string; name: string; color: string };
type MetricItem = {
  label: string;
  value: string;
  detail?: string;
  accent?: string;
  featured?: boolean;
};
type BarItem = { id?: string; name: string; value: number; color?: string; detail?: string };

const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--popover-foreground)",
  boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)",
};
const gridStroke = "var(--border)";
const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };

function dateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}
function php(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}
function compactPhp(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-₱" : "₱";
  if (absolute >= 1_000_000) return sign + (absolute / 1_000_000).toFixed(1) + "m";
  if (absolute >= 1_000) return sign + (absolute / 1_000).toFixed(0) + "k";
  return sign + absolute.toFixed(0);
}
function number(value: number) {
  return value.toLocaleString();
}
function rate(value: number | null) {
  return value == null ? "N/A" : value.toFixed(1) + "%";
}
function duration(value: number | null) {
  if (value == null) return "N/A";
  return value >= 48 ? (value / 24).toFixed(1) + " days" : value.toFixed(1) + " hours";
}
function monthLabel(value: string) {
  const date = new Date(value + "-01T00:00:00.000Z");
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date)
    : value;
}
function MetricGrid({ items }: { items: MetricItem[] }) {
  const columns = items.length >= 6
    ? "lg:grid-cols-3 2xl:grid-cols-6"
    : items.length >= 5
      ? "lg:grid-cols-3 2xl:grid-cols-5"
    : items.length === 3
      ? "lg:grid-cols-3"
      : "lg:grid-cols-4";
  return (
    <div className={"grid grid-cols-2 gap-3 sm:gap-4 " + columns}>
      {items.map((item, index) => (
        <Card
          key={item.label}
          className={
            "min-w-0 overflow-hidden " +
            (item.featured ? "border-primary/25 bg-primary/[0.035]" : "bg-card")
          }
        >
          <CardContent className="flex min-h-[76px] flex-col justify-between gap-3 p-3.5 sm:min-h-[84px] sm:p-4">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.accent ?? chartColors[index % chartColors.length] }}
              />
              <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">{item.label}</p>
            </div>
            <div className="min-w-0">
              <p className={"break-words font-semibold tracking-tight tabular-nums " + (item.featured ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl")}>
                {item.value}
              </p>
              {item.detail && <p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">{item.detail}</p>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
function ChartCard({
  title,
  caption,
  children,
  className = "",
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={"min-w-0 overflow-hidden " + className}>
      <CardHeader className="space-y-1 p-4 pb-1 sm:p-5 sm:pb-2">
        <CardTitle className="text-sm font-semibold sm:text-base">{title}</CardTitle>
        {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
      </CardHeader>
      <CardContent className="min-w-0 p-4 pt-2 sm:p-5 sm:pt-3">{children}</CardContent>
    </Card>
  );
}
function EmptyChart({ label = "No matching activity in this date range." }: { label?: string }) {
  return <div className="flex min-h-44 items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground">{label}</div>;
}
function TrendChart({
  title,
  caption,
  data,
  series,
}: {
  title: string;
  caption?: string;
  data: Point[];
  series: Series[];
}) {
  const hasValues = data.some((row) => series.some((line) => Number(row[line.key] ?? 0) !== 0));
  return (
    <ChartCard title={title} caption={caption}>
      {hasValues ? (
        <div className="h-64 min-w-0 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} accessibilityLayer margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={gridStroke} strokeDasharray="3 4" />
              <XAxis dataKey="month" tick={axisTick} tickFormatter={monthLabel} minTickGap={24} tickLine={false} axisLine={false} />
              <YAxis tick={axisTick} allowDecimals={false} width={40} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(label) => monthLabel(String(label))}
                formatter={(value, name) => [number(Number(value)), String(name)]}
              />
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />}
              {series.map((line) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  name={line.name}
                  stroke={line.color}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : <EmptyChart />}
    </ChartCard>
  );
}
function RevenueTrend({ data }: { data: Point[] }) {
  const hasValues = data.some((row) => Number(row.net ?? 0) !== 0);
  return (
    <ChartCard title="Net WorkSync earnings trend" caption="Test-mode earnings by payment and refund date.">
      {hasValues ? (
        <div className="h-64 min-w-0 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} accessibilityLayer margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="analyticsRevenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.015} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={gridStroke} strokeDasharray="3 4" />
              <XAxis dataKey="month" tick={axisTick} tickFormatter={monthLabel} minTickGap={24} tickLine={false} axisLine={false} />
              <YAxis tick={axisTick} width={78} tickFormatter={(value: number) => compactPhp(value)} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(label) => monthLabel(String(label))}
                formatter={(value) => [php(Number(value)), "Net WorkSync earnings"]}
              />
              <Area
                type="monotone"
                dataKey="net"
                name="Net WorkSync earnings"
                stroke="var(--chart-1)"
                strokeWidth={2.5}
                fill="url(#analyticsRevenueFill)"
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : <EmptyChart />}
    </ChartCard>
  );
}
function RevenueSourceChart({ fees, premium }: { fees: number; premium: number }) {
  const rows = [
    { name: "Project transaction fees", value: fees, color: chartColors[0] },
    { name: "Premium subscriptions", value: premium, color: chartColors[1] },
  ];
  const hasValues = rows.some((row) => row.value !== 0);
  return (
    <ChartCard title="Net WorkSync earnings by source" caption="Project fees and Premium subscriptions after recorded refunds.">
      {hasValues ? (
        <div className="h-64 min-w-0 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} accessibilityLayer layout="vertical" margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke={gridStroke} strokeDasharray="3 4" />
              <XAxis type="number" tick={axisTick} tickFormatter={(value: number) => compactPhp(value)} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [php(Number(value)), "Net WorkSync earnings"]} />
              <Bar dataKey="value" name="Net WorkSync earnings" radius={[0, 5, 5, 0]} maxBarSize={42} isAnimationActive={false}>
                {rows.map((row) => <Cell key={row.name} fill={row.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : <EmptyChart />}
    </ChartCard>
  );
}
function BarRows({
  label,
  counts,
  items,
  limit = 7,
  emptyLabel,
  valueFormatter,
}: {
  label: string;
  counts: Record<string, number>;
  items?: BarItem[];
  limit?: number;
  emptyLabel?: string;
  valueFormatter?: (value: number) => string;
}) {
  const all = (items ?? Object.entries(counts).map(([name, value]) => ({ name, value })))
    .map((item) => ({ ...item, name: item.name.replaceAll("_", " ") }))
    .sort((a, b) => b.value - a.value);
  const rows: BarItem[] = all.length > limit
    ? [...all.slice(0, limit - 1), { name: "Other categories", value: all.slice(limit - 1).reduce((sum, row) => sum + row.value, 0) }]
    : all;
  const max = Math.max(0, ...rows.map((row) => row.value));
  const displayValue = (value: number) => valueFormatter?.(value) ?? number(value);
  if (!rows.length || max === 0) return <EmptyChart label={emptyLabel} />;
  return (
    <div role="group" aria-label={label} className="space-y-3.5">
      {rows.map((row, index) => {
        const normalized = row.name.toLowerCase();
        const color = normalized.includes("complete") || normalized.includes("paid") || normalized.includes("resolved") || normalized.includes("success")
          ? chartColors[1]
          : normalized.includes("overdue") || normalized.includes("pending") || normalized.includes("review") || normalized.includes("open")
            ? chartColors[2]
            : normalized.includes("failed") || normalized.includes("cancel") || normalized.includes("dismiss")
              ? chartColors[4]
              : chartColors[index % chartColors.length];
        return (
          <div key={row.id ?? row.name} aria-label={row.name + ": " + displayValue(row.value)} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0">
                <span className="block truncate text-muted-foreground" title={row.name}>{row.name}</span>
                {row.detail && <span className="mt-0.5 block text-[10px] text-muted-foreground/80">{row.detail}</span>}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{displayValue(row.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted/70">
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: Math.max(2, (row.value / max) * 100) + "%", backgroundColor: row.color ?? color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
function BarsCard({
  title,
  caption,
  counts,
  limit,
}: {
  title: string;
  caption?: string;
  counts: Record<string, number>;
  limit?: number;
}) {
  return (
    <ChartCard title={title} caption={caption}>
      <BarRows label={title} counts={counts} limit={limit} />
    </ChartCard>
  );
}
type LeaderboardItem = { userId: string; name: string; amount: number; detail: string };
function PeopleLeaderboard({
  title,
  caption,
  rows,
  emptyLabel,
}: {
  title: string;
  caption: string;
  rows: LeaderboardItem[];
  emptyLabel: string;
}) {
  const maxAmount = Math.max(0, ...rows.map((row) => row.amount));
  return (
    <ChartCard title={title} caption={caption}>
      {rows.length ? (
        <ol aria-label={title} className="space-y-3">
          {rows.map((row, index) => (
            <li key={row.userId} className="space-y-2">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={row.name}>{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.detail}</p>
                  </div>
                </div>
                <p className="shrink-0 text-right text-sm font-semibold tabular-nums">{php(row.amount)}</p>
              </div>
              <div aria-hidden="true" className="ml-10 h-1.5 overflow-hidden rounded-full bg-muted/70">
                <div
                  className="h-full rounded-full bg-primary/75"
                  style={{ width: maxAmount > 0 ? Math.max(2, (row.amount / maxAmount) * 100) + "%" : "0%" }}
                />
              </div>
            </li>
          ))}
        </ol>
      ) : <EmptyChart label={emptyLabel} />}
    </ChartCard>
  );
}
function TopSellingServiceCategoriesCard({
  data,
  unrankedProjectCount,
}: {
  data: AdminAnalyticsResult["projects"]["topSellingServiceCategories"];
  unrankedProjectCount: number;
}) {
  const coverageNote = unrankedProjectCount > 0
    ? " · " + number(unrankedProjectCount) + " paid projects lack category/price data"
    : "";
  return (
    <ChartCard title="Top-selling service categories" caption={"Paid test project base by job/service category · before refunds; VAT and WorkSync fee excluded" + coverageNote}>
      <BarRows
        label="Paid project value by service category"
        counts={{}}
        items={data.map((category) => ({
          id: category.categoryId ?? "uncategorized",
          name: category.categoryName,
          detail: number(category.paidProjects) + (category.paidProjects === 1 ? " project" : " projects"),
          value: category.projectValue,
        }))}
        valueFormatter={php}
        emptyLabel={unrankedProjectCount > 0
          ? "Paid projects in this date range are missing category or price details for this ranking."
          : "No paid test project values in the selected dates."}
      />
    </ChartCard>
  );
}
function TopPostedServiceCategoriesCard({
  data,
}: {
  data: AdminAnalyticsResult["projects"]["topPostedServiceCategories"];
}) {
  return (
    <ChartCard title="Most-posted service categories">
      <BarRows
        label="Service categories by new listing count"
        counts={{}}
        items={data.map((category) => ({
          id: category.categoryId ?? "uncategorized",
          name: category.categoryName,
          value: category.listingCount,
        }))}
        emptyLabel="No service listings were created in this date range."
      />
    </ChartCard>
  );
}
function RoleDonut({ data }: { data: AdminAnalyticsResult["users"] }) {
  const otherRoles = Math.max(0, data.total - data.clients - data.freelancers);
  const roles = [
    { name: "Clients", value: data.clients, color: chartColors[0] },
    { name: "Freelancers", value: data.freelancers, color: chartColors[1] },
    { name: "Admin / other", value: otherRoles, color: chartColors[3] },
  ].filter((role) => role.value > 0);
  return (
    <ChartCard title="User mix">
      {data.total > 0 && roles.length ? (
        <>
          <div className="relative h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart accessibilityLayer>
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [number(Number(value)), "Accounts"]} />
                <Pie data={roles} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="88%" paddingAngle={2} stroke="var(--card)" strokeWidth={3} isAnimationActive={false}>
                  {roles.map((role) => <Cell key={role.name} fill={role.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-1">
              <span className="text-2xl font-semibold tabular-nums">{number(data.total)}</span>
              <span className="text-[11px] text-muted-foreground">users</span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3">
            {roles.map((role) => (
              <div key={role.name} className="flex min-w-0 items-center gap-2 text-xs">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: role.color }} />
                <span className="truncate text-muted-foreground">{role.name}</span>
                <span className="ml-auto font-semibold tabular-nums">{number(role.value)}</span>
              </div>
            ))}
          </div>
        </>
      ) : <EmptyChart label="No user accounts to compare." />}
    </ChartCard>
  );
}
function RevenueCoverage({ data }: { data: AdminAnalyticsResult["earnings"] }) {
  const notes: string[] = [];
  if (data.missingFeeSnapshots) notes.push(number(data.missingFeeSnapshots) + " project payment(s) lack a platform-fee snapshot and are excluded.");
  if (data.missingPremiumTaxableSnapshots) notes.push(number(data.missingPremiumTaxableSnapshots) + " Premium event(s) lack a taxable-amount snapshot and are excluded.");
  if (data.unknownProjectFeeRefunds) notes.push(number(data.unknownProjectFeeRefunds) + " full refund(s) could not be matched to a fee snapshot.");
  if (data.partialProjectRefunds) notes.push(number(data.partialProjectRefunds) + " partial refund(s) have no stored platform-fee allocation; no reversal was estimated.");
  if (!notes.length) return null;
  return (
    <details className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium text-muted-foreground">Revenue data coverage ({notes.length})</summary>
      <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">{notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </details>
  );
}
function MiniStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 p-3">
      <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold tabular-nums sm:text-base">{value}</p>
      {detail && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

export default function AdminAnalytics() {
  const current = new Date();
  const [from, setFrom] = useState(dateInput(new Date(Date.UTC(current.getUTCFullYear(), 0, 1))));
  const [through, setThrough] = useState(dateInput(current));
  const [data, setData] = useState<AdminAnalyticsResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const version = useRef(0);
  const updateFrom = (value: string) => { version.current++; setFrom(value); };
  const updateThrough = (value: string) => { version.current++; setThrough(value); };
  const resetFilters = () => {
    version.current++;
    const now = new Date();
    setFrom(dateInput(new Date(Date.UTC(now.getUTCFullYear(), 0, 1))));
    setThrough(dateInput(now));
  };

  const load = useCallback(async () => {
    const requestVersion = ++version.current;
    setLoading(true);
    setError("");
    try {
      if (!from || !through || from > through) throw new Error("Choose a valid date range.");
      const result = await getAdminAnalytics(from, through, "test");
      if (requestVersion === version.current) setData(result);
    } catch (cause) {
      if (requestVersion === version.current) {
        setError(cause instanceof Error ? cause.message : "Unable to load analytics.");
        setData(null);
      }
    } finally {
      if (requestVersion === version.current) setLoading(false);
    }
  }, [from, through]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  const revenueTrend: Point[] = data?.earnings.activity.map((item) => ({ month: item.month, net: item.net })) ?? [];
  const userTrend: Point[] = data?.users.activity.map((item) => ({
    month: item.month,
    users: item.users,
    clients: item.clients,
    freelancers: item.freelancers,
  })) ?? [];
  const projectTrend: Point[] = data?.projects.activity.map((item) => ({
    month: item.month,
    created: item.created,
    completed: item.completed,
  })) ?? [];
  const serviceTrend: Point[] = data?.projects.serviceActivity.map((item) => ({
    month: item.month,
    posted: item.posted,
  })) ?? [];
  const paymentTrend: Point[] = data?.transactions.activity.map((item) => ({
    month: item.month,
    successful: item.successful,
    failed: item.failed,
    pending: item.pending,
  })) ?? [];

  return (
    <div className="mx-auto min-w-0 max-w-[1600px] space-y-5 pb-6">
      <AdminPageHeader title="Platform analytics" />

      <AdminFilterPanel ariaLabel="Filter platform analytics" className="p-3 sm:p-3">
        <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(9rem,1fr)_minmax(9rem,1fr)_auto]">
          <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
            From
            <Input className="h-9 rounded-lg bg-background text-sm font-normal text-foreground" type="date" value={from} onChange={(event) => updateFrom(event.target.value)} />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
            Through
            <Input className="h-9 rounded-lg bg-background text-sm font-normal text-foreground" type="date" value={through} onChange={(event) => updateThrough(event.target.value)} />
          </label>
          <div className="flex gap-2 sm:col-span-2 sm:justify-end xl:col-span-1">
            <Button className="h-9 flex-1 rounded-lg px-3 text-xs sm:flex-none" variant="ghost" onClick={resetFilters}>
              <RotateCcw className="size-3.5" />Reset
            </Button>
            <Button className="h-9 flex-1 rounded-lg px-3 text-xs sm:flex-none" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />Refresh
            </Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          <span>UTC dates</span>
          <span aria-hidden="true">·</span>
          <span>Test payments only</span>
          <span aria-hidden="true">·</span>
          <span>Current snapshots are labeled</span>
        </div>
      </AdminFilterPanel>

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      {loading ? (
        <ContentSkeleton label="Loading platform analytics" variant="reports" />
      ) : data ? (
        <Tabs defaultValue="earnings" className="min-w-0">
          <TabsList aria-label="Platform analytics sections" className="grid w-full grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="disputes-reports">Disputes &amp; Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="earnings" className="space-y-3">
            <MetricGrid items={[
              { label: "Net WorkSync earnings", value: php(data.earnings.net), featured: true },
              { label: "Gross WorkSync earnings", value: php(data.earnings.gross), detail: "Before refunds; VAT excluded", accent: chartColors[0] },
              { label: "Gross project transaction fees", value: php(data.earnings.grossTransactionFees), detail: "Net: " + php(data.earnings.transactionFees), accent: chartColors[1] },
              { label: "Gross Premium subscription earnings", value: php(data.earnings.grossPremiumSubscriptions), detail: "Net: " + php(data.earnings.premiumSubscriptions), accent: chartColors[3] },
              { label: "WorkSync platform refunds", value: php(data.earnings.refunds), accent: chartColors[4] },
            ]} />
            <div className="grid min-w-0 gap-4 xl:grid-cols-[1.5fr_1fr]">
              <RevenueTrend data={revenueTrend} />
              <RevenueSourceChart fees={data.earnings.transactionFees} premium={data.earnings.premiumSubscriptions} />
            </div>
            <RevenueCoverage data={data.earnings} />
          </TabsContent>

          <TabsContent value="users" className="space-y-3">
            <MetricGrid items={[
              { label: "Total users", value: number(data.users.total), featured: true },
              { label: "New registrations", value: number(data.users.newlyRegistered), accent: chartColors[0] },
              { label: "Verified", value: number(data.users.verified), detail: number(data.users.unverified) + " unverified", accent: chartColors[1] },
              { label: "Paid Premium", value: number(data.users.premiumSubscribers), accent: chartColors[3] },
            ]} />
            <div className="grid min-w-0 gap-4 xl:grid-cols-[1.55fr_1fr]">
              <TrendChart
                title="Registrations over time"
                caption="New accounts per month"
                data={userTrend}
                series={[
                  { key: "users", name: "All users", color: chartColors[0] },
                  { key: "clients", name: "Clients", color: chartColors[1] },
                  { key: "freelancers", name: "Freelancers", color: chartColors[3] },
                ]}
              />
              <RoleDonut data={data.users} />
            </div>
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              <PeopleLeaderboard
                title="Top buying clients"
                caption="Gross paid volume · VAT included"
                emptyLabel="No paid test payments in the selected dates."
                rows={data.users.topClients.map((client) => ({
                  userId: client.userId,
                  name: client.displayName,
                  amount: client.grossPaid,
                  detail: number(client.paidPaymentCount) + " paid payments",
                }))}
              />
              <PeopleLeaderboard
                title="Top earning freelancers"
                caption="Payout earnings · VAT excluded; withdrawals excluded"
                emptyLabel="No test-mode freelancer earnings recorded in the selected dates."
                rows={data.users.topFreelancers.map((freelancer) => ({
                  userId: freelancer.userId,
                  name: freelancer.displayName,
                  amount: freelancer.earningsExcludingVat,
                  detail: number(freelancer.payoutRecordCount) + " project payout records",
                }))}
              />
            </div>
          </TabsContent>

          <TabsContent value="projects" className="space-y-3">
            <MetricGrid items={[
              { label: "Created", value: number(data.projects.created), featured: true },
              { label: "Completed", value: number(data.projects.completedInRange), accent: chartColors[1] },
              { label: "Active now", value: number(data.projects.active), accent: chartColors[0] },
              { label: "Cohort completion rate", value: rate(data.projects.completionRate), accent: chartColors[3] },
              { label: "Paid project sales", value: number(data.projects.paidProjectSalesCount), accent: chartColors[4] },
              { label: "New service listings", value: number(data.projects.servicesPostedCount), accent: chartColors[3] },
            ]} />
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              <ChartCard title="Project status signals" caption="Overdue and disputed can overlap with active projects.">
                <BarRows
                  label="Project status signals"
                  counts={{
                    "Active now": data.projects.active,
                    "Completed in range": data.projects.completedInRange,
                    "Overdue now": data.projects.overdue,
                    "Disputed now": data.projects.disputed,
                  }}
                />
              </ChartCard>
              <ChartCard title="Project type">
                <BarRows label="Project type" counts={{ Standard: data.projects.standard, "Milestone-based": data.projects.milestone }} />
              </ChartCard>
            </div>
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              <TrendChart
                title="Project activity"
                caption="Created and completed each month"
                data={projectTrend}
                series={[
                  { key: "created", name: "Created", color: chartColors[0] },
                  { key: "completed", name: "Completed", color: chartColors[1] },
                ]}
              />
              <TrendChart
                title="Service posting activity"
                caption="New service listings per month"
                data={serviceTrend}
                series={[{ key: "posted", name: "Listings posted", color: chartColors[3] }]}
              />
            </div>
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              <TopSellingServiceCategoriesCard
                data={data.projects.topSellingServiceCategories}
                unrankedProjectCount={data.projects.unrankedPaidProjectCount}
              />
              <TopPostedServiceCategoriesCard data={data.projects.topPostedServiceCategories} />
            </div>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-3">
            <MetricGrid items={[
              { label: "Successful", value: number(data.transactions.successful), featured: true },
              { label: "Pending", value: number(data.transactions.pending), accent: chartColors[2] },
              { label: "Failed", value: number(data.transactions.failed), accent: chartColors[4] },
              { label: "Gross successful transaction volume", value: php(data.transactions.successfulVolume), accent: chartColors[0] },
            ]} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MiniStat
                label="Project payouts outstanding"
                value={data.transactions.projectPayoutBalanceAvailable
                  ? php(data.transactions.payoutPendingAmount)
                  : "Unavailable"}
              />
              <MiniStat
                label="Test withdrawals pending"
                value={data.transactions.testWithdrawalsAvailable
                  ? php(data.transactions.testWithdrawalPendingAmount)
                  : "Unavailable"}
              />
              <MiniStat
                label="Test withdrawals paid"
                value={data.transactions.testWithdrawalsAvailable
                  ? php(data.transactions.testWithdrawalPaidAmount)
                  : "Unavailable"}
              />
              <MiniStat label="Customer refunds" value={php(data.transactions.refundAmount)} />
            </div>
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              <BarsCard title="Payments by status" caption="Project and Premium checkout records" counts={data.transactions.statuses} />
              <TrendChart
                title="Transaction volume"
                caption="Records per month, grouped by current status"
                data={paymentTrend}
                series={[
                  { key: "successful", name: "Successful", color: chartColors[1] },
                  { key: "pending", name: "Pending", color: chartColors[2] },
                  { key: "failed", name: "Failed", color: chartColors[4] },
                ]}
              />
            </div>
            <BarsCard title="Project payment methods" caption="Successful project payments" counts={data.transactions.paymentMethods} />
          </TabsContent>

          <TabsContent value="disputes-reports" className="space-y-3">
            <MetricGrid items={[
              { label: "Open disputes", value: number(data.disputesReports.openDisputes), featured: true },
              { label: "Resolved", value: number(data.disputesReports.resolvedDisputes), accent: chartColors[1] },
              { label: "Resolution rate", value: rate(data.disputesReports.disputeResolutionRate), accent: chartColors[0] },
              { label: "Avg. resolution", value: duration(data.disputesReports.averageDisputeResolutionHours), accent: chartColors[3] },
            ]} />
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <MiniStat label="Listing reports" value={number(data.disputesReports.reportsTotal)} />
              <MiniStat label="Avg. report review" value={duration(data.disputesReports.averageReportReviewHours)} />
            </div>
            <div className="grid min-w-0 gap-3 xl:grid-cols-2">
              <ChartCard title="Open disputes by reason" caption="Open or under review">
                <BarRows
                  label="Open disputes by reason"
                  counts={data.disputesReports.openDisputesByReason}
                  emptyLabel="No open disputes in this date range."
                />
              </ChartCard>
              <ChartCard title="Unreviewed reports by category" caption="Reports without a review timestamp">
                <BarRows
                  label="Unreviewed listing reports by category"
                  counts={data.disputesReports.unreviewedReportsByCategory}
                  emptyLabel="No unreviewed reports in this date range."
                />
              </ChartCard>
            </div>
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}
