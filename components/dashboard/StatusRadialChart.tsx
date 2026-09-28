"use client";
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

/** Shadboard TrafficSources radial layout, using real project-status shares. */
export function StatusRadialChart({
  statuses,
  total,
}: {
  statuses: { name: string; color: string; value: number }[];
  total: number;
}) {
  const rows = statuses.map((status) => ({
    ...status,
    share: total ? (status.value / total) * 100 : 0,
    fill: status.color,
  }));
  return (
    <div className="space-y-5">
      <div className="relative mx-auto h-56 max-w-72">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            data={rows}
            innerRadius="38%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            barSize={12}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar
              dataKey="share"
              background={{ fill: "var(--muted)" }}
              cornerRadius={6}
              isAnimationActive={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
              formatter={(value, _name, item) => [
                `${Number(value).toFixed(1)}%`,
                item.payload.name,
              ]}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <strong className="text-2xl font-semibold tabular-nums">
            {total}
          </strong>
          <span className="text-xs text-muted-foreground">requests</span>
        </div>
      </div>
      <ul className="divide-y">
        {rows.map((row) => (
          <li
            key={row.name}
            className="flex items-center justify-between gap-3 py-2.5 text-sm"
          >
            <span className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ background: row.color }}
                aria-hidden="true"
              />
              {row.name}
            </span>
            <span className="flex shrink-0 items-center gap-3 tabular-nums">
              <span className="text-xs text-muted-foreground">
                {row.share.toFixed(0)}%
              </span>
              <strong className="font-medium">{row.value}</strong>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
