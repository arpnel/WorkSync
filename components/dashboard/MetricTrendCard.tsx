"use client";

import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Adapted from Shadboard's DashboardOverviewCardV3 and UniqueVisitorsChart. */
export function MetricTrendCard({
  title,
  value,
  detail,
  icon: Icon,
  points,
  color,
  loading = false,
  unavailable = false,
}: {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  points: { date: string; value: number }[];
  color: string;
  loading?: boolean;
  unavailable?: boolean;
}) {
  const gradient = useId().replaceAll(":", "");
  return (
    <Card className="metric-card min-w-0">
      <div className="space-y-3 p-5 pb-2">
        <div className="flex flex-wrap-reverse items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
          <span className="hidden shrink-0 rounded-md border bg-muted/50 p-2 sm:block">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </div>
        {loading ? (
          <Skeleton
            className="h-9 w-full max-w-32"
            aria-label="Loading total"
          />
        ) : (
          <p className="break-words text-[clamp(1.125rem,2.3vw,2rem)] font-semibold tracking-tight tabular-nums">
            {value}
          </p>
        )}
        <p className="min-h-8 text-xs leading-5 text-muted-foreground">
          {detail}
        </p>
      </div>
      <div
        className="h-14 min-w-0 sm:h-24"
        aria-label={`${title} over the selected period`}
      >
        {loading ? (
          <Skeleton className="h-full w-full rounded-none" />
        ) : unavailable ? (
          <p className="px-5 pt-8 text-xs text-muted-foreground">
            Trend unavailable
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={points}
              accessibilityLayer
              margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <Tooltip
                cursor={false}
                contentStyle={{
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
                formatter={(value) => [
                  Number(value).toLocaleString("en-PH"),
                  title,
                ]}
              />
              <Area
                dataKey="value"
                name={title}
                type="monotone"
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradient})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
