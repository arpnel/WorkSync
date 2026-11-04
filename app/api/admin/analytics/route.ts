import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;
const MAX_ROWS = 50_000;
const successfulStatuses = new Set(["paid", "refunded"]);
const failedStatuses = new Set(["failed", "canceled", "cancelled", "expired"]);
const pendingStatuses = new Set(["pending", "processing", "needs_review", "created"]);
const pendingPayoutStatuses = new Set(["awaiting_account", "ready", "processing", "pending", "queued"]);
const json = (data: unknown) =>
  Response.json(data, { headers: { "Cache-Control": "no-store" } });

type QueryResult<T> = {
  data: T[] | null;
  error: { message: string; code?: string } | null;
};

async function readRows<T>(
  readPage: (from: number, through: number) => PromiseLike<QueryResult<T>>,
  label: string,
) {
  const rows: T[] = [];
  for (let offset = 0; offset <= MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await readPage(offset, offset + PAGE_SIZE - 1);
    if (error) throw new PaymentError(`${label} are unavailable.`);
    const page = data ?? [];
    if (rows.length + page.length > MAX_ROWS) {
      throw new PaymentError(
        "This date range contains too many records to aggregate exactly. Narrow the date range and try again.",
        422,
      );
    }
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
  throw new PaymentError(
    "This date range contains too many records to aggregate exactly. Narrow the date range and try again.",
    422,
  );
}

async function readOptionalRows<T>(
  readPage: (from: number, through: number) => PromiseLike<QueryResult<T>>,
  label: string,
) {
  const rows: T[] = [];
  for (let offset = 0; offset <= MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await readPage(offset, offset + PAGE_SIZE - 1);
    if (error) {
      if (error.code === "PGRST205" || error.code === "42P01") return null;
      throw new PaymentError(`${label} are unavailable.`);
    }
    const page = data ?? [];
    if (rows.length + page.length > MAX_ROWS) {
      throw new PaymentError(
        "This date range contains too many records to aggregate exactly. Narrow the date range and try again.",
        422,
      );
    }
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
  throw new PaymentError(
    "This date range contains too many records to aggregate exactly. Narrow the date range and try again.",
    422,
  );
}

async function exactCount(
  request: PromiseLike<{
    count: number | null;
    error: { message: string } | null;
  }>,
  label: string,
) {
  const { count, error } = await request;
  if (error) throw new PaymentError(`${label} are unavailable.`);
  return count ?? 0;
}

function parseDate(value: string | null, field: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new PaymentError(`Choose a valid ${field} date.`, 400);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new PaymentError(`Choose a valid ${field} date.`, 400);
  }
  return parsed;
}

function toCents(value: number | string | null | undefined) {
  if (value == null || value === "") return null;
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(cents)) {
    throw new PaymentError("A transaction amount is outside the supported range.");
  }
  return cents;
}

function fromCents(value: number) {
  return value / 100;
}

function monthKey(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 7) : null;
}

function monthKeys(from: Date, endExclusive: Date) {
  const cursor = new Date(from);
  cursor.setUTCDate(1);
  const months: string[] = [];
  while (cursor < endExclusive) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function addCount(target: Record<string, number>, key: string | null | undefined) {
  const name = key?.trim() || "unspecified";
  target[name] = (target[name] ?? 0) + 1;
}

function classifyStatus(status: string | null | undefined) {
  const normalized = status?.toLowerCase() ?? "unspecified";
  if (successfulStatuses.has(normalized)) return "successful" as const;
  if (failedStatuses.has(normalized)) return "failed" as const;
  if (pendingStatuses.has(normalized)) return "pending" as const;
  return "other" as const;
}

type UserRow = { user_id: string; role: string; created_at: string };
type VerificationRow = { user_id: string; status: string; verified_at: string | null };
type ProjectRow = {
  project_id: string; status: string; project_type: string; created_at: string | null;
  completed_at: string | null; due_date: string | null; deadline_at: string | null;
};
type PaidProjectSourceRow = {
  project_id: string; order_id: string | null; application_id: string | null;
};
type CurrentProjectRow = {
  project_id: string; due_date: string | null; deadline_at: string | null;
};
type CompletedProjectRow = { project_id: string; completed_at: string | null };
type PaymentRow = {
  payment_id: string; created_at: string | null; paid_at: string | null; status: string | null;
  project_id?: string | null; order_id: string | null; payer_id?: string | null;
  livemode: boolean | null; amount: number | string | null;
  platform_service_fee: number | string | null;
  freelancer_service_vat_taxable_base?: number | string | null;
  freelancer_service_vat_amount?: number | string | null;
  payment_method: string | null;
};
type ServiceOrderSourceRow = {
  order_id: string; service_id: string | null; job_id: string | null; application_id: string | null;
};
type JobApplicationSourceRow = { application_id: string; job_id: string | null };
type ServiceCategorySourceRow = { service_id: string; category_id: string | null };
type JobCategorySourceRow = { job_id: string; category_id: string | null };
type ServiceCategoryRow = { id: string; name: string };
type ServiceListingRow = { service_id: string; category_id: string | null; created_at: string };
type ServiceCategorySalesRow = {
  categoryId: string | null; categoryName: string; paidProjects: number; projectValue: number;
};
type SubscriptionOrderRow = {
  order_id: string; created_at: string | null; paid_at: string | null; status: string | null;
  livemode: boolean | null; amount: number | string | null; taxable_amount: number | string | null;
  refund_status: string | null; refund_completed_at: string | null;
};
type ProjectRefundRow = {
  refund_id: string; payment_id: string; amount: number | string; status: string;
  mode: string; refunded_at: string | null;
};
type RefundPaymentRow = {
  payment_id: string; amount: number | string | null;
  platform_service_fee: number | string | null; livemode: boolean | null;
};
type PayoutRow = {
  payout_id: string;
  recipient_id: string;
  status: string;
  amount: number | string;
  gross_amount: number | string | null;
  freelancer_vat_taxable_amount: number | string | null;
  freelancer_vat_amount: number | string | null;
  withdrawal_requested_at: string | null;
  provider_transfer_id: string | null;
  provider_batch_id: string | null;
  created_at: string;
  mode: string;
};
type ProfileNameRow = { user_id: string; display_name: string | null };
type PayoutAllocationRow = { payout_id: string; gross_amount: number | string };
type TestWithdrawalRow = {
  withdrawal_id: string;
  status: string;
  requested_net_amount: number | string;
  requested_at: string;
};
type DisputeRow = {
  dispute_id: string; project_id: string; status: string; category: string; created_at: string; resolved_at: string | null;
};
type ReportRow = { report_id: string; status: string; reason: string; created_at: string; reviewed_at: string | null };

export async function GET(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const admin = await db
      .from("admin_members")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (admin.error) throw new PaymentError("Administrator access could not be verified.");
    if (!admin.data) throw new PaymentError("Administrator access required.", 403);

    const params = new URL(request.url).searchParams;
    const from = parseDate(params.get("from"), "start");
    const through = parseDate(params.get("through"), "end");
    if (from > through) throw new PaymentError("The start date must be before the end date.", 400);
    const maxThrough = new Date(from);
    maxThrough.setUTCFullYear(maxThrough.getUTCFullYear() + 5);
    if (through > maxThrough) throw new PaymentError("Choose a date range of five years or less.", 400);
    const environment = params.get("environment") ?? "live";
    if (!["all", "live", "test"].includes(environment)) {
      throw new PaymentError("Choose a valid payment environment.", 400);
    }
    const endExclusive = new Date(through);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    const fromIso = from.toISOString();
    const endIso = endExclusive.toISOString();
    const currentTime = new Date().toISOString();
    const selectedEnvironment = environment as "all" | "live" | "test";
    const monthList = monthKeys(from, endExclusive);

    const readUsers = (start: number, end: number) =>
      db.from("Users").select("user_id,role,created_at")
        .gte("created_at", fromIso).lt("created_at", endIso)
        .order("created_at", { ascending: true }).order("user_id", { ascending: true })
        .range(start, end);
    const readVerifications = (start: number, end: number) =>
      db.from("verification_requests").select("user_id,status,verified_at")
        .eq("is_current", true).order("user_id", { ascending: true }).range(start, end);
    const readProjects = (start: number, end: number) =>
      db.from("projects").select("project_id,status,project_type,created_at,completed_at,due_date,deadline_at")
        .gte("created_at", fromIso).lt("created_at", endIso)
        .order("created_at", { ascending: true }).order("project_id", { ascending: true })
        .range(start, end);
    const readCurrentProjects = (start: number, end: number) =>
      db.from("projects").select("project_id,due_date,deadline_at")
        .in("status", ["active", "revision"])
        .order("project_id", { ascending: true }).range(start, end);
    const readCompletedProjects = (start: number, end: number) =>
      db.from("projects").select("project_id,completed_at")
        .eq("status", "completed").gte("completed_at", fromIso).lt("completed_at", endIso)
        .order("completed_at", { ascending: true }).order("project_id", { ascending: true })
        .range(start, end);
    const readServiceListings = (start: number, end: number) =>
      db.from("services").select("service_id,category_id,created_at")
        .gte("created_at", fromIso).lt("created_at", endIso)
        .order("created_at", { ascending: true }).order("service_id", { ascending: true })
        .range(start, end);
    const readPaymentsCreated = (start: number, end: number) => {
      let query = db.from("payments")
        .select("payment_id,order_id,created_at,paid_at,status,livemode,amount,platform_service_fee,payment_method")
        .gte("created_at", fromIso).lt("created_at", endIso);
      if (selectedEnvironment !== "all") query = query.eq("livemode", selectedEnvironment === "live");
      return query.order("created_at", { ascending: true }).order("payment_id", { ascending: true }).range(start, end);
    };
    const readPaymentsPaid = (start: number, end: number) => {
      const query = db.from("payments")
        .select("payment_id,project_id,order_id,payer_id,created_at,paid_at,status,livemode,amount,platform_service_fee,freelancer_service_vat_taxable_base,freelancer_service_vat_amount,payment_method")
        .in("status", ["paid", "refunded"]).eq("livemode", false)
        .gte("paid_at", fromIso).lt("paid_at", endIso);
      return query.order("paid_at", { ascending: true }).order("payment_id", { ascending: true }).range(start, end);
    };
    const readSubscriptionsCreated = (start: number, end: number) => {
      let query = db.from("subscription_orders")
        .select("order_id,created_at,paid_at,status,livemode,amount,taxable_amount,refund_status,refund_completed_at")
        .gte("created_at", fromIso).lt("created_at", endIso);
      if (selectedEnvironment !== "all") query = query.eq("livemode", selectedEnvironment === "live");
      return query.order("created_at", { ascending: true }).order("order_id", { ascending: true }).range(start, end);
    };
    const readSubscriptionsPaid = (start: number, end: number) => {
      const query = db.from("subscription_orders")
        .select("order_id,created_at,paid_at,status,livemode,amount,taxable_amount,refund_status,refund_completed_at")
        .in("status", ["paid", "refunded"]).eq("livemode", false)
        .gte("paid_at", fromIso).lt("paid_at", endIso);
      return query.order("paid_at", { ascending: true }).order("order_id", { ascending: true }).range(start, end);
    };
    const readProjectRefunds = (start: number, end: number) => {
      const query = db.from("project_refunds")
        .select("refund_id,payment_id,amount,status,mode,refunded_at")
        .eq("status", "refunded").eq("mode", "test")
        .gte("refunded_at", fromIso).lt("refunded_at", endIso);
      return query.order("refunded_at", { ascending: true }).order("refund_id", { ascending: true }).range(start, end);
    };
    const readSubscriptionRefunds = (start: number, end: number) => {
      const query = db.from("subscription_orders")
        .select("order_id,created_at,paid_at,status,livemode,amount,taxable_amount,refund_status,refund_completed_at")
        .eq("refund_status", "refunded").eq("livemode", false)
        .gte("refund_completed_at", fromIso).lt("refund_completed_at", endIso);
      return query.order("refund_completed_at", { ascending: true }).order("order_id", { ascending: true }).range(start, end);
    };
    const readPayouts = (start: number, end: number) => {
      let query = db.from("project_payouts")
        .select("payout_id,recipient_id,status,amount,gross_amount,freelancer_vat_taxable_amount,freelancer_vat_amount,withdrawal_requested_at,provider_transfer_id,provider_batch_id,created_at,mode")
        .gte("created_at", fromIso).lt("created_at", endIso);
      if (selectedEnvironment !== "all") query = query.eq("mode", selectedEnvironment);
      return query.order("created_at", { ascending: true }).order("payout_id", { ascending: true }).range(start, end);
    };
    const readPayoutAllocations = (payoutIds: string[], start: number, end: number) =>
      db.from("payout_withdrawal_allocations")
        .select("payout_id,gross_amount")
        .in("payout_id", payoutIds)
        .order("payout_id", { ascending: true })
        .range(start, end);
    const readTestWithdrawals = (start: number, end: number) =>
      db.from("payout_withdrawal_requests")
        .select("withdrawal_id,status,requested_net_amount,requested_at,mode")
        .eq("mode", selectedEnvironment === "live" ? "live" : "test")
        .gte("requested_at", fromIso).lt("requested_at", endIso)
        .order("requested_at", { ascending: true }).order("withdrawal_id", { ascending: true })
        .range(start, end);
    const readDisputes = (start: number, end: number) =>
      db.from("project_disputes").select("dispute_id,project_id,status,category,created_at,resolved_at")
        .gte("created_at", fromIso).lt("created_at", endIso)
        .order("created_at", { ascending: true }).order("dispute_id", { ascending: true })
        .range(start, end);
    const readCurrentOpenDisputes = (start: number, end: number) =>
      db.from("project_disputes").select("project_id")
        .in("status", ["open", "under_review"])
        .order("project_id", { ascending: true }).range(start, end);
    const readReports = (start: number, end: number) =>
      db.from("listing_reports").select("report_id,status,reason,created_at,reviewed_at")
        .gte("created_at", fromIso).lt("created_at", endIso)
        .order("created_at", { ascending: true }).order("report_id", { ascending: true }).range(start, end);

    const [userTotal, clientsTotal, freelancersTotal, premiumSubscribers, users, verifications,
      projects, currentProjects, completedProjects, serviceListings, paymentsCreated, paymentsPaid,
      subscriptionsCreated, subscriptionsPaid, projectRefunds, subscriptionRefunds,
      payouts, testWithdrawals, disputes, currentOpenDisputes, reports] = await Promise.all([
      exactCount(db.from("Users").select("user_id", { count: "exact", head: true }), "User analytics"),
      exactCount(db.from("Users").select("user_id", { count: "exact", head: true }).eq("role", "client"), "Client analytics"),
      exactCount(db.from("Users").select("user_id", { count: "exact", head: true }).eq("role", "freelancer"), "Freelancer analytics"),
      exactCount(db.from("user_subscriptions").select("user_id", { count: "exact", head: true })
        .eq("plan_code", "pro").eq("access_type", "paid").gt("period_ends_at", currentTime), "Premium subscriber analytics"),
      readRows<UserRow>(readUsers, "User registration analytics"),
      readRows<VerificationRow>(readVerifications, "Verification analytics"),
      readRows<ProjectRow>(readProjects, "Project analytics"),
      readRows<CurrentProjectRow>(readCurrentProjects, "Current project analytics"),
      readRows<CompletedProjectRow>(readCompletedProjects, "Project completion analytics"),
      readRows<ServiceListingRow>(readServiceListings, "Service listing analytics"),
      readRows<PaymentRow>(readPaymentsCreated, "Transaction analytics"),
      readRows<PaymentRow>(readPaymentsPaid, "Earnings analytics"),
      readRows<SubscriptionOrderRow>(readSubscriptionsCreated, "Premium transaction analytics"),
      readRows<SubscriptionOrderRow>(readSubscriptionsPaid, "Premium earnings analytics"),
      readRows<ProjectRefundRow>(readProjectRefunds, "Project refund analytics"),
      readRows<SubscriptionOrderRow>(readSubscriptionRefunds, "Premium refund analytics"),
      readRows<PayoutRow>(readPayouts, "Freelancer payout analytics"),
      readOptionalRows<TestWithdrawalRow>(readTestWithdrawals, "Test withdrawal analytics"),
      readRows<DisputeRow>(readDisputes, "Dispute analytics"),
      readRows<{ project_id: string }>(readCurrentOpenDisputes, "Current dispute analytics"),
      readRows<ReportRow>(readReports, "Listing report analytics"),
    ]);

    const payoutRows = payouts as PayoutRow[];

    const clientPurchases = new Map<string, { amountCents: number; paymentCount: number }>();
    for (const payment of paymentsPaid as PaymentRow[]) {
      if (payment.status?.toLowerCase() !== "paid" || !payment.payer_id) continue;
      const amountCents = toCents(payment.amount);
      if (amountCents == null) continue;
      const totals = clientPurchases.get(payment.payer_id) ?? { amountCents: 0, paymentCount: 0 };
      totals.amountCents += amountCents;
      totals.paymentCount++;
      clientPurchases.set(payment.payer_id, totals);
    }
    const topClientRows = [...clientPurchases.entries()]
      .map(([userId, totals]) => ({ userId, ...totals }))
      .sort((a, b) => b.amountCents - a.amountCents || b.paymentCount - a.paymentCount || a.userId.localeCompare(b.userId))
      .slice(0, 5);

    // Keep the leaderboard aligned with the freelancer earnings view: count
    // recorded test-mode payout earnings, excluding VAT and later withdrawals.
    const earnedPayoutStatuses = new Set([
      "awaiting_account", "ready", "processing", "pending", "paid", "failed", "needs_review",
    ]);
    const freelancerEarnings = new Map<string, { amountCents: number; payoutCount: number }>();
    for (const payout of payoutRows) {
      if (payout.mode !== "test" || !earnedPayoutStatuses.has(payout.status.toLowerCase())) continue;
      const earningsCents = toCents(
        payout.freelancer_vat_taxable_amount ??
        (payout.gross_amount == null
          ? payout.amount
          : Number(payout.gross_amount) - Number(payout.freelancer_vat_amount ?? 0)),
      );
      if (earningsCents == null || !payout.recipient_id) continue;
      const totals = freelancerEarnings.get(payout.recipient_id) ?? { amountCents: 0, payoutCount: 0 };
      totals.amountCents += Math.max(0, earningsCents);
      totals.payoutCount++;
      freelancerEarnings.set(payout.recipient_id, totals);
    }
    const topFreelancerRows = [...freelancerEarnings.entries()]
      .map(([userId, totals]) => ({ userId, ...totals }))
      .sort((a, b) => b.amountCents - a.amountCents || b.payoutCount - a.payoutCount || a.userId.localeCompare(b.userId))
      .slice(0, 5);
    const leaderboardUserIds = [...new Set([
      ...topClientRows.map((row) => row.userId),
      ...topFreelancerRows.map((row) => row.userId),
    ])];
    const profileNames = new Map<string, string>();
    if (leaderboardUserIds.length) {
      const { data, error } = await db.from("profiles")
        .select("user_id,display_name")
        .in("user_id", leaderboardUserIds);
      if (error) throw new PaymentError("User leaderboard names are unavailable.");
      for (const profile of (data ?? []) as ProfileNameRow[]) {
        if (profile.display_name?.trim()) profileNames.set(profile.user_id, profile.display_name.trim());
      }
    }
    const topClients = topClientRows.map((row) => ({
      userId: row.userId,
      displayName: profileNames.get(row.userId) ?? `Client ${row.userId.slice(0, 8)}`,
      grossPaid: fromCents(row.amountCents),
      paidPaymentCount: row.paymentCount,
    }));
    const topFreelancers = topFreelancerRows.map((row) => ({
      userId: row.userId,
      displayName: profileNames.get(row.userId) ?? `Freelancer ${row.userId.slice(0, 8)}`,
      earningsExcludingVat: fromCents(row.amountCents),
      payoutRecordCount: row.payoutCount,
    }));

    const payoutIds = payoutRows.map((payout) => payout.payout_id);
    let payoutAllocationRows: PayoutAllocationRow[] | null = [];
    if (payoutIds.length) {
      for (let index = 0; index < payoutIds.length; index += 500) {
        const batch = payoutIds.slice(index, index + 500);
        const allocations = await readOptionalRows<PayoutAllocationRow>(
          (start, end) => readPayoutAllocations(batch, start, end),
          "Payout allocation analytics",
        );
        if (allocations === null) {
          payoutAllocationRows = null;
          break;
        }
        payoutAllocationRows?.push(...allocations);
      }
    }

    // Job-based sales have a category on jobs; service-based sales have one
    // on services. Resolve both through the paid project's source listing.
    const paidProjectPaymentById = new Map<string, PaymentRow>();
    for (const payment of paymentsPaid as PaymentRow[]) {
      if (payment.status?.toLowerCase() !== "paid" || !payment.project_id) continue;
      if (!paidProjectPaymentById.has(payment.project_id)) {
        paidProjectPaymentById.set(payment.project_id, payment);
      }
    }
    const paidProjectIds = [...paidProjectPaymentById.keys()];
    const paidProjectIdSet = new Set(paidProjectIds);
    const paidProjectRows: PaidProjectSourceRow[] = [];
    for (let index = 0; index < paidProjectIds.length; index += 500) {
      const batch = paidProjectIds.slice(index, index + 500);
      const rows = await readRows<PaidProjectSourceRow>(
        (start, end) => db.from("projects")
          .select("project_id,order_id,application_id")
          .in("project_id", batch)
          .order("project_id", { ascending: true })
          .range(start, end),
        "Paid project category analytics",
      );
      paidProjectRows.push(...rows);
    }

    const paidProjectOrderIds = [...new Set(
      paidProjectRows.flatMap((project) => project.order_id ? [project.order_id] : []),
    )];
    const paidServiceOrders: ServiceOrderSourceRow[] = [];
    for (let index = 0; index < paidProjectOrderIds.length; index += 500) {
      const batch = paidProjectOrderIds.slice(index, index + 500);
      const rows = await readRows<ServiceOrderSourceRow>(
        (start, end) => db.from("service_orders")
          .select("order_id,service_id,job_id,application_id")
          .in("order_id", batch)
          .order("order_id", { ascending: true })
          .range(start, end),
        "Paid project listing analytics",
      );
      paidServiceOrders.push(...rows);
    }

    const projectApplicationIds = [...new Set([
      ...paidProjectRows.flatMap((project) => project.application_id ? [project.application_id] : []),
      ...paidServiceOrders.flatMap((order) => order.application_id ? [order.application_id] : []),
    ])];
    const jobApplications: JobApplicationSourceRow[] = [];
    for (let index = 0; index < projectApplicationIds.length; index += 500) {
      const batch = projectApplicationIds.slice(index, index + 500);
      const rows = await readRows<JobApplicationSourceRow>(
        (start, end) => db.from("job_applications")
          .select("application_id,job_id")
          .in("application_id", batch)
          .order("application_id", { ascending: true })
          .range(start, end),
        "Paid job category analytics",
      );
      jobApplications.push(...rows);
    }

    const paidServiceIds = [...new Set(
      paidServiceOrders.flatMap((order) => order.service_id ? [order.service_id] : []),
    )];
    const paidJobIds = [...new Set([
      ...paidServiceOrders.flatMap((order) => order.job_id ? [order.job_id] : []),
      ...jobApplications.flatMap((application) => application.job_id ? [application.job_id] : []),
    ])];
    const paidServiceCategories: ServiceCategorySourceRow[] = [];
    for (let index = 0; index < paidServiceIds.length; index += 500) {
      const batch = paidServiceIds.slice(index, index + 500);
      const rows = await readRows<ServiceCategorySourceRow>(
        (start, end) => db.from("services")
          .select("service_id,category_id")
          .in("service_id", batch)
          .order("service_id", { ascending: true })
          .range(start, end),
        "Paid service category analytics",
      );
      paidServiceCategories.push(...rows);
    }
    const paidJobCategories: JobCategorySourceRow[] = [];
    for (let index = 0; index < paidJobIds.length; index += 500) {
      const batch = paidJobIds.slice(index, index + 500);
      const rows = await readRows<JobCategorySourceRow>(
        (start, end) => db.from("jobs")
          .select("job_id,category_id")
          .in("job_id", batch)
          .order("job_id", { ascending: true })
          .range(start, end),
        "Paid job category analytics",
      );
      paidJobCategories.push(...rows);
    }
    const serviceOrderById = new Map(paidServiceOrders.map((order) => [order.order_id, order]));
    const applicationJobById = new Map(jobApplications.map((application) => [application.application_id, application.job_id]));
    const serviceCategoryById = new Map(paidServiceCategories.map((service) => [service.service_id, service.category_id]));
    const jobCategoryById = new Map(paidJobCategories.map((job) => [job.job_id, job.category_id]));
    const categoryByProjectId = new Map<string, string | null>();
    for (const project of paidProjectRows) {
      const order = project.order_id ? serviceOrderById.get(project.order_id) : undefined;
      const applicationId = project.application_id ?? order?.application_id ?? null;
      const jobId = order?.job_id ?? (applicationId ? applicationJobById.get(applicationId) : null) ?? null;
      const categoryId = (order?.service_id ? serviceCategoryById.get(order.service_id) : null) ??
        (jobId ? jobCategoryById.get(jobId) : null) ?? null;
      categoryByProjectId.set(project.project_id, categoryId);
    }

    const salesByServiceCategory = new Map<string | null, { projectIds: Set<string>; valueCents: number }>();
    let unrankedPaidProjectCount = paidProjectIds.length - paidProjectRows.length;
    for (const project of paidProjectRows) {
      if (!paidProjectIdSet.has(project.project_id)) continue;
      const payment = paidProjectPaymentById.get(project.project_id);
      if (!payment) continue;
      const baseSnapshot = toCents(payment.freelancer_service_vat_taxable_base);
      const grossCents = toCents(payment.amount);
      const vatCents = toCents(payment.freelancer_service_vat_amount);
      const platformFeeCents = toCents(payment.platform_service_fee);
      const projectValueCents = baseSnapshot ?? (
        grossCents != null && vatCents != null && platformFeeCents != null
          ? grossCents - vatCents - platformFeeCents
          : null
      );
      if (projectValueCents == null || projectValueCents < 0) {
        unrankedPaidProjectCount++;
        continue;
      }
      const categoryId = categoryByProjectId.get(project.project_id) ?? null;
      const totals = salesByServiceCategory.get(categoryId) ?? { projectIds: new Set<string>(), valueCents: 0 };
      totals.projectIds.add(project.project_id);
      totals.valueCents += projectValueCents;
      salesByServiceCategory.set(categoryId, totals);
    }
    const paidProjectSalesCount = paidProjectRows.length;
    const categoryIds = [...new Set([
      ...[...salesByServiceCategory.keys()].flatMap((categoryId) => categoryId ? [categoryId] : []),
      ...(serviceListings as ServiceListingRow[]).flatMap((service) => service.category_id ? [service.category_id] : []),
    ])];
    const serviceCategories: ServiceCategoryRow[] = [];
    for (let index = 0; index < categoryIds.length; index += 500) {
      const batch = categoryIds.slice(index, index + 500);
      const rows = await readRows<ServiceCategoryRow>(
        (start, end) => db.from("job_categories")
          .select("id,name")
          .in("id", batch)
          .order("id", { ascending: true })
          .range(start, end),
        "Service category analytics",
      );
      serviceCategories.push(...rows);
    }
    const categoryNameById = new Map(serviceCategories.map((category) => [category.id, category.name]));
    const topSellingServiceCategories: ServiceCategorySalesRow[] = [...salesByServiceCategory.entries()]
      .map(([categoryId, totals]) => ({
        categoryId,
        categoryName: categoryId
          ? categoryNameById.get(categoryId) || `Category ${categoryId.slice(0, 8)}`
          : "Uncategorized",
        paidProjects: totals.projectIds.size,
        projectValue: fromCents(totals.valueCents),
      }))
      .sort((a, b) => b.projectValue - a.projectValue || b.paidProjects - a.paidProjects || a.categoryName.localeCompare(b.categoryName))
      .slice(0, 7);
    const postedServiceCounts = new Map<string | null, number>();
    const serviceActivity = new Map(monthList.map((month) => [month, { month, posted: 0 }]));
    for (const service of serviceListings as ServiceListingRow[]) {
      const categoryId = service.category_id;
      postedServiceCounts.set(categoryId, (postedServiceCounts.get(categoryId) ?? 0) + 1);
      const month = serviceActivity.get(monthKey(service.created_at) ?? "");
      if (month) month.posted++;
    }
    const topPostedServiceCategories = [...postedServiceCounts.entries()]
      .map(([categoryId, listingCount]) => ({
        categoryId,
        categoryName: categoryId
          ? categoryNameById.get(categoryId) || `Category ${categoryId.slice(0, 8)}`
          : "Uncategorized",
        listingCount,
      }))
      .sort((a, b) => b.listingCount - a.listingCount || a.categoryName.localeCompare(b.categoryName))
      .slice(0, 5);

    const revenueMonths = new Map(monthList.map((month) => [month, {
      month, transactionFeesCents: 0, premiumSubscriptionsCents: 0, refundsCents: 0,
    }]));
    let grossTransactionFeesCents = 0;
    let grossPremiumSubscriptionsCents = 0;
    let projectFeeRefundsCents = 0;
    let premiumRefundsCents = 0;
    let missingFeeSnapshots = 0;
    let missingPremiumTaxableSnapshots = 0;
    let unknownProjectFeeRefunds = 0;
    let partialProjectRefunds = 0;
    for (const payment of paymentsPaid as PaymentRow[]) {
      const feeCents = toCents(payment.platform_service_fee);
      if (feeCents == null) { missingFeeSnapshots++; continue; }
      grossTransactionFeesCents += feeCents;
      const bucket = revenueMonths.get(monthKey(payment.paid_at) ?? "");
      if (bucket) bucket.transactionFeesCents += feeCents;
    }
    for (const order of subscriptionsPaid as SubscriptionOrderRow[]) {
      if (!successfulStatuses.has(order.status?.toLowerCase() ?? "")) continue;
      const taxableCents = toCents(order.taxable_amount);
      if (taxableCents == null) { missingPremiumTaxableSnapshots++; continue; }
      grossPremiumSubscriptionsCents += taxableCents;
      const bucket = revenueMonths.get(monthKey(order.paid_at) ?? "");
      if (bucket) bucket.premiumSubscriptionsCents += taxableCents;
    }

    const paymentIds = [...new Set((projectRefunds as ProjectRefundRow[]).map((refund) => refund.payment_id))];
    const refundPayments = new Map<string, RefundPaymentRow>();
    for (let index = 0; index < paymentIds.length; index += 500) {
      const batch = paymentIds.slice(index, index + 500);
      const { data, error } = await db.from("payments")
        .select("payment_id,amount,platform_service_fee,livemode").in("payment_id", batch);
      if (error) throw new PaymentError("Project refund revenue analytics are unavailable.");
      for (const payment of (data ?? []) as RefundPaymentRow[]) refundPayments.set(payment.payment_id, payment);
    }
    const seenRefundPayments = new Set<string>();
    for (const refund of projectRefunds as ProjectRefundRow[]) {
      if (seenRefundPayments.has(refund.payment_id)) continue;
      seenRefundPayments.add(refund.payment_id);
      const payment = refundPayments.get(refund.payment_id);
      if (!payment) { unknownProjectFeeRefunds++; continue; }
      const refundCents = toCents(refund.amount);
      const paidCents = toCents(payment.amount);
      if (refundCents == null || paidCents == null || refundCents > paidCents) {
        unknownProjectFeeRefunds++;
        continue;
      }
      if (refundCents < paidCents) { partialProjectRefunds++; continue; }
      const refundEnvironmentMatches = payment.livemode === false && refund.mode === "test";
      if (!refundEnvironmentMatches) {
        unknownProjectFeeRefunds++;
        continue;
      }
      const feeCents = toCents(payment.platform_service_fee);
      if (feeCents == null) { unknownProjectFeeRefunds++; continue; }
      projectFeeRefundsCents += feeCents;
      const bucket = revenueMonths.get(monthKey(refund.refunded_at) ?? "");
      if (bucket) bucket.refundsCents += feeCents;
    }
    for (const order of subscriptionRefunds as SubscriptionOrderRow[]) {
      const taxableCents = toCents(order.taxable_amount);
      if (taxableCents == null) { missingPremiumTaxableSnapshots++; continue; }
      premiumRefundsCents += taxableCents;
      const bucket = revenueMonths.get(monthKey(order.refund_completed_at) ?? "");
      if (bucket) bucket.refundsCents += taxableCents;
    }

    const revenueActivity = [...revenueMonths.values()].map((month) => {
      const transactionFees = fromCents(month.transactionFeesCents);
      const premiumSubscriptions = fromCents(month.premiumSubscriptionsCents);
      const refunds = fromCents(month.refundsCents);
      return { month: month.month, transactionFees, premiumSubscriptions, refunds,
        net: transactionFees + premiumSubscriptions - refunds };
    });
    const collectedRevenueCents = grossTransactionFeesCents + grossPremiumSubscriptionsCents;
    const refundedRevenueCents = projectFeeRefundsCents + premiumRefundsCents;

    const userActivity = new Map(monthList.map((month) => [month, { month, users: 0, clients: 0, freelancers: 0 }]));
    const newUsers = users as UserRow[];
    let newClients = 0;
    let newFreelancers = 0;
    for (const account of newUsers) {
      const bucket = userActivity.get(monthKey(account.created_at) ?? "");
      if (bucket) {
        bucket.users++;
        if (account.role === "client") bucket.clients++;
        if (account.role === "freelancer") bucket.freelancers++;
      }
      if (account.role === "client") newClients++;
      if (account.role === "freelancer") newFreelancers++;
    }
    const verifiedUsers = new Set((verifications as VerificationRow[])
      .filter((row) => row.verified_at && ["approved", "verified"].includes(row.status.toLowerCase()))
      .map((row) => row.user_id)).size;

    const projectRows = projects as ProjectRow[];
    const currentProjectRows = currentProjects as CurrentProjectRow[];
    const completedProjectRows = completedProjects as CompletedProjectRow[];
    const projectDisputeRows = disputes as DisputeRow[];
    const projectActivity = new Map(monthList.map((month) => [month, { month, created: 0, completed: 0 }]));
    let activeProjects = 0;
    let overdueProjects = 0;
    let standardProjects = 0;
    let milestoneProjects = 0;
    let createdCohortCompleted = 0;
    const nowTime = Date.now();
    for (const project of projectRows) {
      const createdMonth = projectActivity.get(monthKey(project.created_at) ?? "");
      if (createdMonth) createdMonth.created++;
      const normalized = project.status.toLowerCase();
      if (project.project_type === "standard") standardProjects++;
      if (project.project_type === "milestone") milestoneProjects++;
      if (normalized === "completed") createdCohortCompleted++;
    }
    for (const project of currentProjectRows) {
      activeProjects++;
      const dueTime = project.deadline_at
        ? new Date(project.deadline_at).getTime()
        : project.due_date
          ? new Date(`${project.due_date}T23:59:59.999Z`).getTime()
          : null;
      if (dueTime != null && Number.isFinite(dueTime) && dueTime < nowTime) overdueProjects++;
    }
    for (const project of completedProjectRows) {
      const completedMonth = projectActivity.get(monthKey(project.completed_at) ?? "");
      if (completedMonth) completedMonth.completed++;
    }
    const completedInRange = completedProjectRows.length;
    const disputedProjectCount = new Set((currentOpenDisputes as { project_id: string }[])
      .map((row) => row.project_id)).size;

    const allTransactions = [
      ...(paymentsCreated as PaymentRow[]).map((row) => ({
        created_at: row.created_at, status: row.status, amount: row.amount,
        payment_method: row.payment_method, source: "project" as const,
      })),
      ...(subscriptionsCreated as SubscriptionOrderRow[]).map((row) => ({
        created_at: row.created_at, status: row.status, amount: row.amount,
        payment_method: null, source: "premium" as const,
      })),
    ];
    const transactionStatuses: Record<string, number> = {};
    const paymentMethods: Record<string, number> = {};
    const transactionActivity = new Map(monthList.map((month) => [month, {
      month, successful: 0, failed: 0, pending: 0,
    }]));
    let successfulTransactions = 0;
    let failedTransactions = 0;
    let pendingTransactions = 0;
    let otherTransactions = 0;
    let successfulVolumeCents = 0;
    let pendingVolumeCents = 0;
    for (const transaction of allTransactions) {
      const normalized = transaction.status?.toLowerCase() ?? "unspecified";
      addCount(transactionStatuses, normalized);
      const classification = classifyStatus(normalized);
      const bucket = transactionActivity.get(monthKey(transaction.created_at) ?? "");
      const amountCents = toCents(transaction.amount);
      if (classification === "successful") {
        successfulTransactions++;
        if (amountCents != null) successfulVolumeCents += amountCents;
        if (bucket) bucket.successful++;
        if (transaction.source === "project") addCount(paymentMethods, transaction.payment_method);
      } else if (classification === "failed") {
        failedTransactions++;
        if (bucket) bucket.failed++;
      } else if (classification === "pending") {
        pendingTransactions++;
        if (amountCents != null) pendingVolumeCents += amountCents;
        if (bucket) bucket.pending++;
      } else {
        otherTransactions++;
      }
    }

    const payoutStatuses: Record<string, number> = {};
    const allocatedByPayout = new Map<string, number>();
    for (const allocation of payoutAllocationRows ?? []) {
      const cents = toCents(allocation.gross_amount) ?? 0;
      allocatedByPayout.set(
        allocation.payout_id,
        (allocatedByPayout.get(allocation.payout_id) ?? 0) + cents,
      );
    }
    let pendingPayoutCount = 0;
    let pendingPayoutCents = 0;
    let paidPayoutCount = 0;
    let paidPayoutCents = 0;
    for (const payout of payoutRows) {
      const status = payout.status.toLowerCase();
      addCount(payoutStatuses, status);
      const amountCents = toCents(payout.amount) ?? 0;
      if (pendingPayoutStatuses.has(status)) {
        let remainingCents = amountCents;
        if (status === "ready") {
          if (
            payout.withdrawal_requested_at ||
            payout.provider_transfer_id ||
            payout.provider_batch_id
          ) {
            remainingCents = 0;
          } else {
            const taxableCents = toCents(payout.freelancer_vat_taxable_amount);
            const grossCents = toCents(payout.gross_amount);
            const vatCents = toCents(payout.freelancer_vat_amount);
            const sourceCents = taxableCents ??
              (grossCents != null && vatCents != null ? grossCents - vatCents : null) ??
              grossCents ?? amountCents;
            remainingCents = Math.max(
              0,
              sourceCents - (allocatedByPayout.get(payout.payout_id) ?? 0),
            );
          }
        }
        if (remainingCents > 0) {
          pendingPayoutCount++;
          pendingPayoutCents += remainingCents;
        }
      } else if (status === "paid") {
        paidPayoutCount++;
        paidPayoutCents += amountCents;
      }
    }
    let pendingTestWithdrawalCount = 0;
    let pendingTestWithdrawalCents = 0;
    let paidTestWithdrawalCount = 0;
    let paidTestWithdrawalCents = 0;
    for (const withdrawal of testWithdrawals ?? []) {
      const status = withdrawal.status.toLowerCase();
      const amountCents = toCents(withdrawal.requested_net_amount) ?? 0;
      if (status === "processing") {
        pendingTestWithdrawalCount++;
        pendingTestWithdrawalCents += amountCents;
      } else if (status === "paid") {
        paidTestWithdrawalCount++;
        paidTestWithdrawalCents += amountCents;
      }
    }

    const disputesByStatus: Record<string, number> = {};
    const disputesByReason: Record<string, number> = {};
    const openDisputesByReason: Record<string, number> = {};
    let openDisputes = 0;
    let resolvedDisputes = 0;
    const resolutionHours: number[] = [];
    for (const dispute of projectDisputeRows) {
      const status = dispute.status.toLowerCase();
      addCount(disputesByStatus, status);
      addCount(disputesByReason, dispute.category);
      if (status === "open" || status === "under_review") {
        openDisputes++;
        addCount(openDisputesByReason, dispute.category);
      }
      if (status === "resolved") {
        resolvedDisputes++;
        if (dispute.resolved_at) {
          const hours = (new Date(dispute.resolved_at).getTime() - new Date(dispute.created_at).getTime()) / 3_600_000;
          if (Number.isFinite(hours) && hours >= 0) resolutionHours.push(hours);
        }
      }
    }
    const reportStatuses: Record<string, number> = {};
    const reportsByCategory: Record<string, number> = {};
    const unreviewedReportsByCategory: Record<string, number> = {};
    const reportReviewHours: number[] = [];
    for (const report of reports as ReportRow[]) {
      addCount(reportStatuses, report.status.toLowerCase());
      addCount(reportsByCategory, report.reason);
      if (!report.reviewed_at) addCount(unreviewedReportsByCategory, report.reason);
      if (report.reviewed_at) {
        const hours = (new Date(report.reviewed_at).getTime() - new Date(report.created_at).getTime()) / 3_600_000;
        if (Number.isFinite(hours) && hours >= 0) reportReviewHours.push(hours);
      }
    }

    const premiumCashRefundCents = (subscriptionRefunds as SubscriptionOrderRow[])
      .reduce((sum, order) => sum + (toCents(order.amount) ?? 0), 0);
    const projectCashRefundCents = (projectRefunds as ProjectRefundRow[])
      .reduce((sum, refund) => sum + (toCents(refund.amount) ?? 0), 0);
    const average = (values: number[]) => values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;

    return json({
      dateRange: {
        from: from.toISOString().slice(0, 10),
        through: through.toISOString().slice(0, 10),
        environment: selectedEnvironment,
      },
      earnings: {
        grossTransactionFees: fromCents(grossTransactionFeesCents),
        grossPremiumSubscriptions: fromCents(grossPremiumSubscriptionsCents),
        transactionFees: fromCents(grossTransactionFeesCents - projectFeeRefundsCents),
        premiumSubscriptions: fromCents(grossPremiumSubscriptionsCents - premiumRefundsCents),
        gross: fromCents(collectedRevenueCents),
        projectFeeRefunds: fromCents(projectFeeRefundsCents),
        premiumRefunds: fromCents(premiumRefundsCents),
        refunds: fromCents(refundedRevenueCents),
        net: fromCents(collectedRevenueCents - refundedRevenueCents),
        missingFeeSnapshots,
        missingPremiumTaxableSnapshots,
        unknownProjectFeeRefunds,
        partialProjectRefunds,
        activity: revenueActivity,
      },
      users: {
        total: userTotal,
        newlyRegistered: newUsers.length,
        clients: clientsTotal,
        freelancers: freelancersTotal,
        newClients,
        newFreelancers,
        verified: Math.min(verifiedUsers, userTotal),
        unverified: Math.max(0, userTotal - verifiedUsers),
        premiumSubscribers,
        topClients,
        topFreelancers,
        activity: [...userActivity.values()],
      },
      projects: {
        created: projectRows.length,
        completedInRange,
        active: activeProjects,
        overdue: overdueProjects,
        disputed: disputedProjectCount,
        standard: standardProjects,
        milestone: milestoneProjects,
        paidProjectSalesCount,
        unrankedPaidProjectCount,
        topSellingServiceCategories,
        servicesPostedCount: (serviceListings as ServiceListingRow[]).length,
        topPostedServiceCategories,
        serviceActivity: [...serviceActivity.values()],
        completionRate: projectRows.length
          ? Math.round((createdCohortCompleted / projectRows.length) * 1000) / 10
          : null,
        activity: [...projectActivity.values()],
      },
      transactions: {
        successful: successfulTransactions,
        failed: failedTransactions,
        pending: pendingTransactions,
        other: otherTransactions,
        successfulVolume: fromCents(successfulVolumeCents),
        pendingVolume: fromCents(pendingVolumeCents),
        payoutPendingCount: pendingPayoutCount,
        payoutPendingAmount: fromCents(pendingPayoutCents),
        payoutPaidCount: paidPayoutCount,
        payoutPaidAmount: fromCents(paidPayoutCents),
        projectPayoutBalanceAvailable: payoutAllocationRows !== null,
        testWithdrawalsAvailable: testWithdrawals !== null,
        testWithdrawalPendingCount: pendingTestWithdrawalCount,
        testWithdrawalPendingAmount: fromCents(pendingTestWithdrawalCents),
        testWithdrawalPaidCount: paidTestWithdrawalCount,
        testWithdrawalPaidAmount: fromCents(paidTestWithdrawalCents),
        refundCount: (projectRefunds as ProjectRefundRow[]).length + (subscriptionRefunds as SubscriptionOrderRow[]).length,
        refundAmount: fromCents(projectCashRefundCents + premiumCashRefundCents),
        statuses: transactionStatuses,
        paymentMethods,
        payoutStatuses,
        activity: [...transactionActivity.values()],
      },
      disputesReports: {
        disputeTotal: projectDisputeRows.length,
        openDisputes,
        resolvedDisputes,
        disputeResolutionRate: projectDisputeRows.length
          ? Math.round((resolvedDisputes / projectDisputeRows.length) * 1000) / 10
          : null,
        averageDisputeResolutionHours: average(resolutionHours),
        disputesByStatus,
        disputesByReason,
        openDisputesByReason,
        reportsTotal: (reports as ReportRow[]).length,
        reportsByStatus: reportStatuses,
        reportsByCategory,
        unreviewedReportsByCategory,
        averageReportReviewHours: average(reportReviewHours),
      },
    });
  } catch (error) {
    return paymentResponse(error);
  }
}
