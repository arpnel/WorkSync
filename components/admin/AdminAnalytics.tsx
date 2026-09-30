"use client";
import AdminMetricCard from "./AdminMetricCard";
import AdminStatusChart from "./AdminStatusChart";
import AdminPageHeader from "./AdminPageHeader";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAdminAnalytics } from "@/services/admin/adminService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type { AdminAnalyticsResult } from "@/services/admin/adminResponses";
export default function AdminAnalytics() {
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`),
    [to, setTo] = useState(() => new Date().toISOString().slice(0, 10)),
    [status, setStatus] = useState("all");
  const [data, setData] = useState<AdminAnalyticsResult | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const version = useRef(0);
  const [knownStatuses, setKnownStatuses] = useState<string[]>([]);
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
      <div className="grid gap-4 rounded-2xl border bg-card p-4 sm:flex sm:flex-wrap sm:items-end sm:p-5">
        <label className="text-sm">
          From
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Through
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Status
          <select
            className="block rounded-md border bg-background p-2"
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
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <Button variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {data?.scope === "moderation"
          ? "Dates filter users, reports, disputes and audit actions. Suspended accounts and hidden listings are current totals. Status filters reports, disputes, suspended accounts and hidden listings; it does not filter users or audit actions."
          : "Dates filter record creation. Project status applies to project metrics and the project chart only. Project values are agreed budgets; transaction records are available in Transactions."}
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <ContentSkeleton label="Loading analytics" variant="reports" />
      ) : (
        data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
              }).map(([key, value], index) => (
                <AdminMetricCard
                  key={key}
                  label={key}
                  value={value}
                  index={index}
                />
              ))}
            </div>
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
            {data.scope === "moderation" && (
              <p role="status" className="text-sm text-muted-foreground">
                Project completion, average project value, ratings, monthly
                activity and category activity are unavailable from the current
                analytics service.
              </p>
            )}
            <Card>
              <CardContent className="pt-4">
                <h3 className="mb-4 font-semibold">Activity by month</h3>
                {data.activity === null ? (
                  <p>Monthly activity unavailable.</p>
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
            </Card>
            <h3 className="font-semibold">Category activity</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Jobs</TableHead>
                  <TableHead>Services</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.categories === null ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      Category activity unavailable.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.categories.map((c) => (
                    <TableRow key={c.name}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{c.jobs}</TableCell>
                      <TableCell>{c.services}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        )
      )}
    </div>
  );
}
