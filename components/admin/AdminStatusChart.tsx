"use client";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
const colors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
export default function AdminStatusChart({
  title,
  counts,
  description,
  variant = "bar",
}: {
  title: string;
  counts: Record<string, number>;
  description?: string;
  variant?: "bar" | "pie" | "donut" | "line";
}) {
  const data = Object.entries(counts).map(([name, count]) => ({
    name: name.replaceAll("_", " "),
    count,
  }));
  const tooltip = (
    <Tooltip
      contentStyle={{
        background: "var(--card)",
        borderColor: "var(--border)",
        borderRadius: 12,
        color: "var(--foreground)",
      }}
    />
  );
  const hasValues = data.some((item) => item.count > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        {hasValues ? (
          <>
            <div className="h-60 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                {variant === "pie" || variant === "donut" ? (
                  <PieChart accessibilityLayer>
                    {tooltip}
                    <Pie
                      data={data}
                      dataKey="count"
                      nameKey="name"
                      innerRadius={variant === "donut" ? "52%" : 0}
                      outerRadius="82%"
                      paddingAngle={data.length > 1 ? 3 : 0}
                      isAnimationActive={false}
                    >
                      {data.map((item, i) => (
                        <Cell
                          key={item.name}
                          fill={colors[i % colors.length]}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                ) : variant === "line" ? (
                  <LineChart
                    data={data}
                    accessibilityLayer
                    margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--border)"
                      strokeDasharray="3 3"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      minTickGap={24}
                    />
                    <YAxis allowDecimals={false} width={35} />
                    {tooltip}
                    <Line
                      type="linear"
                      dataKey="count"
                      name="Records"
                      stroke="var(--chart-2)"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                ) : (
                  <BarChart
                    data={data}
                    accessibilityLayer
                    layout="vertical"
                    margin={{ right: 16 }}
                  >
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        borderColor: "var(--border)",
                        borderRadius: 12,
                        color: "var(--foreground)",
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name="Records"
                      radius={[0, 6, 6, 0]}
                      isAnimationActive={false}
                      maxBarSize={60}
                    >
                      {data.map((item, i) => (
                        <Cell
                          key={item.name}
                          fill={colors[i % colors.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            <dl className="mt-4 flex max-h-28 flex-wrap gap-x-5 gap-y-2 overflow-y-auto text-xs">
              {data.map((item, i) => (
                <div key={item.name} className="flex gap-2">
                  <dt className="flex items-center gap-2 capitalize text-muted-foreground">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{
                        background:
                          variant === "line"
                            ? "var(--chart-2)"
                            : colors[i % colors.length],
                      }}
                    />
                    {item.name}
                  </dt>
                  <dd className="font-semibold tabular-nums">{item.count}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No matching activity in this selection.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
