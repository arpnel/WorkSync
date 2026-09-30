"use client";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
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
}: {
  title: string;
  counts: Record<string, number>;
  description?: string;
}) {
  const data = Object.entries(counts).map(([name, count]) => ({
    name: name.replaceAll("_", " "),
    count,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        {data.length ? (
          <>
            <div className="h-60 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} accessibilityLayer>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis allowDecimals={false} width={35} />
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
                    radius={[6, 6, 0, 0]}
                    maxBarSize={60}
                  >
                    {data.map((item, i) => (
                      <Cell key={item.name} fill={colors[i % colors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
              {data.map((item) => (
                <div key={item.name} className="flex gap-2">
                  <dt className="capitalize text-muted-foreground">
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
