import type { DashboardActivity } from "@/services/dashboard/dashboardService";
import type { ProjectPayment } from "@/services/payments/paymentService";

export type WorkProject = DashboardActivity["projects"][number];
export type PaymentResult = ProjectPayment | { status: "unavailable" };
export type PaymentMap = Record<string, PaymentResult>;
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function inPeriod(
  value: string | null | undefined,
  from: string,
  to: string,
) {
  if (!value) return false;
  const day = value.slice(0, 10);
  return day >= from && day <= to;
}
export function previousPeriod(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const day = 86400000;
  return {
    from: new Date(start - (end - start + day)).toISOString().slice(0, 10),
    to: new Date(start - day).toISOString().slice(0, 10),
  };
}
export function growth(current: number, previous: number) {
  if (!previous) return current ? "New this period" : "No change";
  const value = ((current - previous) / previous) * 100;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}% vs previous period`;
}
export function summarize(
  projects: WorkProject[],
  payments: PaymentMap,
  from: string,
  to: string,
) {
  let earnings = 0,
    spending = 0,
    testPayments = 0;
  for (const project of projects) {
    const payment = payments[project.id];
    if (payment?.status !== "paid" || !inPeriod(payment.paidAt, from, to))
      continue;
    const amount = Number(payment.amount ?? 0);
    if (!Number.isFinite(amount)) continue;
    if (payment.mode === "test") testPayments += amount;
    else if (project.party === "freelancer") earnings += amount;
    else spending += amount;
  }
  const requests = projects.filter((p) => inPeriod(p.createdAt, from, to));
  return {
    earnings,
    spending,
    testPayments,
    requests: requests.length,
    started: projects.filter((p) => inPeriod(p.startedAt, from, to)).length,
    completed: projects.filter(
      (p) => p.status === "completed" && inPeriod(p.completedAt, from, to),
    ).length,
    completionRate: requests.length
      ? (requests.filter((p) => p.status === "completed").length /
          requests.length) *
        100
      : null,
  };
}
export function monthlyAnalytics(
  projects: WorkProject[],
  payments: PaymentMap,
  from: string,
  to: string,
) {
  const result = [];
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 7);
    const last = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
    )
      .toISOString()
      .slice(0, 10);
    result.push({
      month: key,
      ...summarize(
        projects,
        payments,
        from > `${key}-01` ? from : `${key}-01`,
        to < last ? to : last,
      ),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

/** Daily detail for short periods; monthly buckets for longer comparisons. */
export function trendAnalytics(
  projects: WorkProject[],
  payments: PaymentMap,
  from: string,
  to: string,
) {
  const first = Date.parse(`${from}T00:00:00Z`);
  const last = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || first > last)
    return [];
  if ((last - first) / 86400000 >= 31)
    return monthlyAnalytics(projects, payments, from, to);
  const result = [];
  for (let day = first; day <= last; day += 86400000) {
    const key = new Date(day).toISOString().slice(0, 10);
    result.push({ month: key, ...summarize(projects, payments, key, key) });
  }
  return result;
}
