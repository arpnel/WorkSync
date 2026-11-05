import { randomUUID } from "node:crypto";
import { PaymentError, paymentMode } from "@/lib/payments/paymongo";
import { verifiedRefundStatus } from "@/lib/payments/refundEvidence";
import { transferRequest } from "@/lib/payments/payouts";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const pageSize = 10;
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

type AdminDatabase = Awaited<ReturnType<typeof paymentUser>>["db"];
type PremiumUsageEvidence = { signals: string[]; verified: boolean };

function hasRollingThreeMonthOverage(
  timestamps: Array<string | null | undefined>,
  eligibleFrom: number,
) {
  const ordered = timestamps
    .map((value) => Date.parse(value ?? ""))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  return ordered.some((timestamp, index) => {
    if (index === 0 || timestamp < eligibleFrom) return false;
    const prior = new Date(ordered[index - 1]);
    const day = prior.getUTCDate();
    prior.setUTCDate(1);
    prior.setUTCMonth(prior.getUTCMonth() + 3);
    const lastDay = new Date(Date.UTC(prior.getUTCFullYear(), prior.getUTCMonth() + 1, 0)).getUTCDate();
    prior.setUTCDate(Math.min(day, lastDay));
    return timestamp < prior.getTime();
  });
}

async function premiumUsageEvidence(
  db: AdminDatabase,
  userId: string,
  paidAt: string | null,
): Promise<PremiumUsageEvidence> {
  if (!paidAt) return { signals: [], verified: false };
  const purchaseTime = Date.parse(paidAt);
  const since = new Date(purchaseTime).toISOString();
  const evidenceStart = new Date(purchaseTime - 3 * 31 * 86_400_000).toISOString();
  const sixMonthsAgo = new Date(Date.now() - 183 * 86_400_000).toISOString();
  const sixMonthStart = since > sixMonthsAgo ? since : sixMonthsAgo;
  const [plans, freelancer, client] = await Promise.all([
    db.from("project_plans").select("plan_id").eq("owner_id", userId).gte("created_at", since).limit(2),
    db.from("freelancer_profiles").select("freelancer_id").eq("user_id", userId).maybeSingle(),
    db.from("client_profiles").select("client_id").eq("user_id", userId).maybeSingle(),
  ]);
  let verified = !plans.error && !freelancer.error && !client.error;
  const signals: string[] = [];
  if ((plans.data?.length ?? 0) > 1) signals.push("More than one project plan created since purchase");

  if (freelancer.data?.freelancer_id) {
    const freelancerId = freelancer.data.freelancer_id;
    const applications = await db.from("job_applications")
      .select("application_id,created_at")
      .eq("freelancer_id", freelancerId)
      .gte("created_at", evidenceStart)
      .order("created_at")
      .limit(1000);
    verified = verified && !applications.error;
    if ((applications.data?.length ?? 0) >= 1000) verified = false;
    if (hasRollingThreeMonthOverage(
      (applications.data ?? []).map((application) => application.created_at),
      purchaseTime,
    )) signals.push("More than one job application in a rolling three-month period since purchase");
  }

  if (client.data?.client_id) {
    const requests = await db.from("service_orders")
      .select("order_id,created_at")
      .eq("client_id", client.data.client_id)
      .not("service_id", "is", null)
      .gte("created_at", evidenceStart)
      .order("created_at")
      .limit(1000);
    if (requests.error || (requests.data?.length ?? 0) >= 1000) verified = false;
    else if (hasRollingThreeMonthOverage(
      (requests.data ?? []).map((request) => request.created_at),
      purchaseTime,
    )) signals.push("More than one Hiring Request in a rolling three-month period since purchase");
  }

  const screeningUsage = await db
    .from("applicant_screening_reservations")
    .select("reservation_id")
    .eq("owner_user_id", userId)
    .gte("completed_at", sixMonthStart)
    .limit(2);
  if (screeningUsage.error) verified = false;
  else if ((screeningUsage.data?.length ?? 0) > 1)
    signals.push("More than one AI applicant screening in the last six months");
  return { signals, verified };
}

type UsageOrder = { order_id: string; user_id: string; paid_at: string | null; created_at: string | null };

async function premiumUsageEvidenceForOrders(
  db: AdminDatabase,
  orders: UsageOrder[],
): Promise<Map<string, PremiumUsageEvidence>> {
  const evidence = new Map<string, PremiumUsageEvidence>();
  if (!orders.length) return evidence;
  const sinceByOrder = new Map(orders.map((row) => [row.order_id, row.paid_at ?? row.created_at ?? ""]));
  const earliest = [...sinceByOrder.values()].filter(Boolean).sort()[0];
  if (!earliest) {
    for (const row of orders) evidence.set(row.order_id, { signals: [], verified: false });
    return evidence;
  }
  const userIds = [...new Set(orders.map((row) => row.user_id))];
  const [plans, freelancers, clients, screenings] = await Promise.all([
    db.from("project_plans").select("plan_id,owner_id,created_at").in("owner_id", userIds).gte("created_at", earliest).limit(1000),
    db.from("freelancer_profiles").select("user_id,freelancer_id").in("user_id", userIds),
    db.from("client_profiles").select("user_id,client_id").in("user_id", userIds),
    db.from("applicant_screening_reservations").select("reservation_id,owner_user_id,completed_at").in("owner_user_id", userIds).gte("completed_at", earliest).limit(1000),
  ]);
  let verified = !plans.error && !freelancers.error && !clients.error && !screenings.error && (plans.data?.length ?? 0) < 1000 && (screenings.data?.length ?? 0) < 1000;
  const freelancerIds = (freelancers.data ?? []).map((row) => row.freelancer_id);
  const clientIds = (clients.data ?? []).map((row) => row.client_id);
  const evidenceStart = new Date(Date.parse(earliest) - 3 * 31 * 86_400_000).toISOString();
  const [applications, hiringRequests] = await Promise.all([
    freelancerIds.length ? db.from("job_applications").select("application_id,freelancer_id,created_at").in("freelancer_id", freelancerIds).gte("created_at", evidenceStart).limit(1000) : Promise.resolve({ data: [], error: null }),
    clientIds.length ? db.from("service_orders").select("order_id,client_id,created_at").in("client_id", clientIds).not("service_id", "is", null).gte("created_at", evidenceStart).limit(1000) : Promise.resolve({ data: [], error: null }),
  ]);
  verified = verified && !applications.error && !hiringRequests.error && (applications.data?.length ?? 0) < 1000 && (hiringRequests.data?.length ?? 0) < 1000;

  const freelancerByUser = new Map((freelancers.data ?? []).map((row) => [row.user_id, row.freelancer_id]));
  const clientByUser = new Map((clients.data ?? []).map((row) => [row.user_id, row.client_id]));
  const day = 86_400_000;
  for (const row of orders) {
    const purchaseTime = Date.parse(sinceByOrder.get(row.order_id) ?? "");
    if (!Number.isFinite(purchaseTime)) {
      evidence.set(row.order_id, { signals: [], verified: false });
      continue;
    }
    const sixMonthStart = Math.max(purchaseTime, Date.now() - 183 * day);
    const signals: string[] = [];
    if ((plans.data ?? []).filter((item) => item.owner_id === row.user_id && Date.parse(item.created_at) >= purchaseTime).length > 1)
      signals.push("More than one project plan created since purchase");
    if ((screenings.data ?? []).filter((item) => item.owner_user_id === row.user_id && item.completed_at && Date.parse(item.completed_at) >= sixMonthStart).length > 1)
      signals.push("More than one AI applicant screening in the last six months");
    const freelancerId = freelancerByUser.get(row.user_id);
    if (freelancerId) {
      const userApplications = (applications.data ?? []).filter((application) => application.freelancer_id === freelancerId);
      if (hasRollingThreeMonthOverage(userApplications.map((application) => application.created_at), purchaseTime))
        signals.push("More than one job application in a rolling three-month period since purchase");
    }
    const clientId = clientByUser.get(row.user_id);
    if (clientId) {
      const userRequests = (hiringRequests.data ?? []).filter((request) => request.client_id === clientId);
      if (hasRollingThreeMonthOverage(userRequests.map((request) => request.created_at), purchaseTime))
        signals.push("More than one Hiring Request in a rolling three-month period since purchase");
    }
    evidence.set(row.order_id, { signals, verified });
  }
  return evidence;
}

async function adminContext(request: Request) {
  const context = await paymentUser(request);
  const admin = await context.db.from("admin_members").select("user_id").eq("user_id", context.user.id).maybeSingle();
  if (admin.error) throw new PaymentError("Unable to verify administrator access.");
  if (!admin.data) throw new PaymentError("Administrator access required.", 403);
  return context;
}

export async function GET(request: Request) {
  try {
    const { db } = await adminContext(request);
    const params = new URL(request.url).searchParams;
    const offsetText = params.get("offset") ?? "0";
    const offset = Number(offsetText);
    const status = params.get("status") ?? "all";
    const mode = params.get("mode") ?? "all";
    const q = params.get("q")?.trim() ?? "";
    const from = params.get("from");
    const through = params.get("through");
    if (!/^\d+$/.test(offsetText) || !Number.isSafeInteger(offset) || offset > 100_000) throw new PaymentError("Invalid page offset.", 400);
    if (!/^(all|pending|paid|refunded|canceled)$/.test(status)) throw new PaymentError("Choose a valid payment status.", 400);
    if (!/^(all|test|live)$/.test(mode)) throw new PaymentError("Choose a valid payment environment.", 400);
    if (q.length > 100 || (q && !/^[a-z\d_-]+$/i.test(q))) throw new PaymentError("Search using an order ID, purchaser ID, or provider reference.", 400);
    for (const value of [from, through]) {
      if (value) {
        const date = new Date(value);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new PaymentError("Choose a valid date range.", 400);
      }
    }
    if (from && through && from > through) throw new PaymentError("The start date must be before the end date.", 400);

    let query = db.from("subscription_orders").select("order_id,user_id,amount,status,transaction_reference,provider_payment_id,livemode,paid_at,created_at,billing_period", { count: "exact" });
    if (["paid", "pending", "refunded"].includes(status)) query = query.eq("status", status);
    if (status === "canceled") query = query.eq("status", "failed");
    if (mode !== "all") query = query.eq("livemode", mode === "live");
    if (from) query = query.gte("created_at", from);
    if (through) query = query.lte("created_at", through);
    if (q) query = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(q)
      ? query.or(`order_id.eq.${q},user_id.eq.${q},transaction_reference.ilike.%${q}%,provider_payment_id.ilike.%${q}%`)
      : query.or(`transaction_reference.ilike.%${q}%,provider_payment_id.ilike.%${q}%`);
    const [page, paid, pending] = await Promise.all([
      query.order("created_at", { ascending: false }).order("order_id", { ascending: false }).range(offset, offset + pageSize - 1),
      db.from("subscription_orders").select("order_id", { count: "exact", head: true }).eq("status", "paid"),
      db.from("subscription_orders").select("order_id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    if (page.error || paid.error || pending.error) throw new PaymentError("Subscription transactions are unavailable.");

    const orders = page.data ?? [];
    const userIds = [...new Set(orders.map((row) => row.user_id))];
    const orderIds = orders.map((row) => row.order_id);
    const [profiles, users, refundState, assignments, latestOrders] = await Promise.all([
      userIds.length ? db.from("profiles").select("user_id,display_name").in("user_id", userIds) : Promise.resolve({ data: [], error: null }),
      userIds.length ? db.from("Users").select("user_id,email").in("user_id", userIds) : Promise.resolve({ data: [], error: null }),
      orderIds.length ? db.from("subscription_orders").select("order_id,refund_id,refund_status,refund_provider_refund_id,refund_claimed_at,refund_updated_at,refund_completed_at").in("order_id", orderIds) : Promise.resolve({ data: [], error: null }),
      userIds.length ? db.from("user_subscriptions").select("user_id,plan_code,access_type,period_started_at,period_ends_at").in("user_id", userIds) : Promise.resolve({ data: [], error: null }),
      Promise.all(userIds.map((userId) => db.from("subscription_orders").select("order_id").eq("user_id", userId).eq("status", "paid").order("paid_at", { ascending: false, nullsFirst: false }).order("order_id", { ascending: false }).limit(1).maybeSingle())),
    ]);
    const refundColumnsMissing = Boolean(
      refundState.error && ["42P01", "42703", "PGRST204", "PGRST205"].includes(refundState.error.code ?? ""),
    );
    if (profiles.error || users.error || assignments.error || latestOrders.some((result) => result.error) || (refundState.error && !refundColumnsMissing))
      throw new PaymentError("Subscription transaction details are unavailable.");
    const names = new Map((profiles.data ?? []).map((row) => [row.user_id, row.display_name]));
    const emails = new Map((users.data ?? []).map((row) => [row.user_id, row.email]));
    const refundRows = new Map((refundState.data ?? []).map((row) => [row.order_id, row]));
    const assignmentByUser = new Map((assignments.data ?? []).map((row) => [row.user_id, row]));
    const latestPaidOrderByUser = new Map(userIds.map((userId, index) => [userId, latestOrders[index].data?.order_id ?? null]));
    const latestOrderIds = new Set(latestOrders.map((result) => result.data?.order_id).filter((id): id is string => !!id));
    const usageByOrder = await premiumUsageEvidenceForOrders(db, orders.filter((row) => latestOrderIds.has(row.order_id)));
    const now = Date.now();
    return json({
      rows: orders.map((row) => {
        const assignment = assignmentByUser.get(row.user_id);
        const endTime = assignment?.period_ends_at ? Date.parse(assignment.period_ends_at) : NaN;
        const remainingMs = Number.isFinite(endTime) ? Math.max(0, endTime - now) : null;
        const remainingDays = remainingMs == null ? null : Math.ceil(remainingMs / 86_400_000);
        const usage = usageByOrder.get(row.order_id) ?? { signals: [], verified: false };
        const currentPaidPremium = assignment?.plan_code === "pro" && assignment.access_type === "paid" && remainingMs != null && remainingMs > 0;
        const canStandardRefund = row.status === "paid" && currentPaidPremium && remainingMs! > 30 * 86_400_000 && latestPaidOrderByUser.get(row.user_id) === row.order_id && usage.verified && usage.signals.length === 0;
        const refund = refundRows.get(row.order_id);
        const refunds = refund?.refund_id && refund.refund_status ? [{
          refund_id: refund.refund_id,
          amount: Number(row.amount),
          status: refund.refund_status,
          provider_refund_id: refund.refund_provider_refund_id,
          claimed_at: refund.refund_claimed_at,
          updated_at: refund.refund_updated_at,
          refunded_at: refund.refund_completed_at,
        }] : [];
        return {
          payment_id: row.order_id, order_id: row.order_id, kind: "subscription", billing_period: row.billing_period,
          project_id: null, payer_id: row.user_id, amount: Number(row.amount), status: row.status,
          payment_method: null, transaction_reference: row.transaction_reference, provider: "PayMongo",
          livemode: row.livemode, currency: "PHP", provider_payment_id: row.provider_payment_id,
          created_at: row.created_at, updated_at: row.created_at, paid_at: row.paid_at, settlement_checked_at: null,
          platform_service_fee: null, platform_vat_amount: null, platform_tax_treatment: null,
          freelancer_service_vat_taxable_base: null, freelancer_service_vat_rate: null,
          freelancer_service_vat_amount: null, freelancer_service_vat_classification: null, freelancer_service_vat_rule: null,
          payer: { user_id: row.user_id, display_name: names.get(row.user_id) ?? null, email: emails.get(row.user_id) ?? null },
          current_premium: assignment ? { plan_code: assignment.plan_code, access_type: assignment.access_type, period_started_at: assignment.period_started_at, period_ends_at: assignment.period_ends_at, remaining_days: remainingDays } : null,
          refund_eligibility: {
            standard: canStandardRefund,
            latest_paid_order: latestPaidOrderByUser.get(row.user_id) === row.order_id,
            usage_signals: usage.signals,
            usage_check_complete: usage.verified,
          },
          project: null, refunds, receipt: null,
        };
      }),
      total: page.count ?? 0, limit: pageSize, offset,
      summary: { total: page.count ?? 0, paid: paid.count ?? 0, pending: pending.count ?? 0 },
      refundsAvailable: !refundColumnsMissing,
    });
  } catch (error) { return paymentResponse(error); }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  let refundId: string | null = null;
  let db: Awaited<ReturnType<typeof paymentUser>>["db"] | null = null;
  try {
    const context = await adminContext(request);
    db = context.db;
    const body = await request.json().catch(() => null) as { orderId?: unknown; reviewedUnused?: unknown; supportTicketRef?: unknown; exceptionType?: unknown; exceptionReason?: unknown; reconcileRefundId?: unknown } | null;
    if (body && typeof (body as { reconcileRefundId?: unknown }).reconcileRefundId === "string") {
      const refundKey = (body as { reconcileRefundId: string }).reconcileRefundId;
      if (!/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(refundKey)) throw new PaymentError("Choose a valid refund record.", 400);
      const { data: refund, error: refundError } = await db.from("subscription_orders").select("order_id,amount,refund_id,refund_status,refund_provider_refund_id,provider_payment_id,livemode").eq("refund_id", refundKey).maybeSingle();
      if (refundError || !refund || !refund.refund_provider_refund_id || !["pending", "needs_review"].includes(refund.refund_status)) throw new PaymentError("This refund is not ready for provider reconciliation.", 409);
      if (!refund.provider_payment_id || refund.livemode !== (paymentMode() === "live")) throw new PaymentError("The refund payment environment requires review.", 409);
      const evidence = await transferRequest(`/v1/refunds/${encodeURIComponent(refund.refund_provider_refund_id)}`);
      const reconciledStatus = verifiedRefundStatus(evidence.data, {
        providerPaymentId: refund.provider_payment_id,
        providerRefundId: refund.refund_provider_refund_id,
        amountCentavos: Math.round(Number(refund.amount) * 100),
        live: refund.livemode,
      });
      const reconciled = await db.rpc("worksync_finish_subscription_refund", { p_refund: refund.refund_id, p_status: reconciledStatus });
      if (reconciled.error || reconciled.data !== true) throw new PaymentError("Refund status could not be recorded safely.");
      return json({ status: reconciledStatus, message: `Provider status: ${reconciledStatus.replaceAll("_", " ")}.` });
    }
    if (!body || typeof body.orderId !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(body.orderId)) throw new PaymentError("Choose a valid subscription transaction.", 400);
    if (typeof body.supportTicketRef !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(body.supportTicketRef.trim())) throw new PaymentError("Enter the support ticket ID you reviewed.", 400);
    if (typeof body.reviewedUnused !== "boolean") throw new PaymentError("Confirm whether a Premium-only benefit was used.", 400);
    const exceptionType = body.exceptionType === "technical_failure" || body.exceptionType === "applicable_law" ? body.exceptionType : null;
    const exceptionReason = typeof body.exceptionReason === "string" ? body.exceptionReason.trim() : "";
    if (body.exceptionType && (!exceptionType || exceptionReason.length < 10 || exceptionReason.length > 2000)) throw new PaymentError("Choose a valid exception and provide at least 10 characters of review notes.", 400);

    const mode = paymentMode();
    const { data: order, error: orderError } = await db.from("subscription_orders").select("order_id,user_id,status,amount,provider_payment_id,livemode,billing_period,paid_at,created_at").eq("order_id", body.orderId).maybeSingle();
    if (orderError || !order || order.status !== "paid") throw new PaymentError("Only a confirmed Premium purchase can be refunded.", 409);
    const { data: supportTicket, error: ticketError } = await db.from("support_tickets").select("ticket_id,requester_id").eq("ticket_id", body.supportTicketRef.trim()).maybeSingle();
    if (ticketError || !supportTicket || supportTicket.requester_id !== order.user_id) throw new PaymentError("Review a support ticket opened by this Premium purchaser.", 409);
    const [{ data: assignment, error: assignmentError }, usage, { data: latest, error: latestError }] = await Promise.all([
      db.from("user_subscriptions").select("plan_code,access_type,period_ends_at").eq("user_id", order.user_id).maybeSingle(),
      premiumUsageEvidence(db, order.user_id, order.paid_at ?? order.created_at),
      db.from("subscription_orders").select("order_id").eq("user_id", order.user_id).eq("status", "paid").order("paid_at", { ascending: false, nullsFirst: false }).order("order_id", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (assignmentError || latestError || !assignment || latest?.order_id !== order.order_id) throw new PaymentError("Review the purchaser’s current Premium status and most recent purchase before issuing a refund.", 409);
    const remainingMs = Date.parse(assignment.period_ends_at) - Date.now();
    const standardEligible = assignment.plan_code === "pro" && assignment.access_type === "paid" && remainingMs > 30 * 86_400_000 && usage.verified && usage.signals.length === 0 && body.reviewedUnused === true;
    if (!standardEligible && (!exceptionType || exceptionReason.length < 10)) throw new PaymentError("Standard refunds require more than 30 days remaining and no recorded or reported Premium-only use. For technical failures or applicable-law exceptions, select an exception and document the review.", 409);
    const claim = await db.rpc("worksync_claim_subscription_refund", {
      p_order: order.order_id,
      p_reviewer: context.user.id,
      p_reviewed_unused: body.reviewedUnused,
      p_support_ticket_ref: supportTicket.ticket_id,
      p_exception_type: exceptionType,
      p_exception_reason: exceptionType ? exceptionReason : null,
      p_usage_evidence: { signals: usage.signals, verified: usage.verified, remaining_days: Math.max(0, Math.ceil(Math.max(0, remainingMs) / 86_400_000)) },
    });
    if (claim.error) throw new PaymentError("This Premium purchase cannot be refunded or already has a refund request.", 409);
    const row = claim.data?.[0];
    if (!row || row.order_id !== body.orderId) throw new PaymentError("Subscription refund reservation is invalid.");
    refundId = row.refund_id;
    const cents = Math.round(Number(row.amount) * 100);
    if (!Number.isSafeInteger(cents) || cents < 100 || Math.abs(Number(row.amount) * 100 - cents) > 0.00001 || row.livemode !== (mode === "live")) throw new PaymentError("The subscription payment environment or amount requires review.");

    const funding = await transferRequest(`/v1/payments/${encodeURIComponent(row.provider_payment_id)}`);
    const payment = funding.data?.attributes;
    if (funding.data?.id !== row.provider_payment_id || payment?.status !== "paid" || payment.currency !== "PHP" || payment.livemode !== row.livemode || payment.disputed !== false || payment.amount !== cents || !Array.isArray(payment.refunds) || payment.refunds.length > 0) throw new PaymentError("PayMongo could not verify an eligible paid subscription transaction.");
    if (!["card", "gcash", "grab_pay", "paymaya", "shopee_pay", "bpi", "billease", "qrph"].includes(payment.source?.type)) throw new PaymentError("This payment method requires manual refund review.");

    const response = await transferRequest("/v1/refunds", { data: { attributes: { amount: cents, payment_id: row.provider_payment_id, reason: "others", notes: `WorkSync Premium refund ${row.order_id}` } } }, `worksync-subscription-refund-${refundId}`);
    const providerRefundId = response.data?.id;
    if (typeof providerRefundId !== "string" || !providerRefundId.startsWith("ref_")) throw new PaymentError("PayMongo refund reference is unavailable.");
    const saved = await db.rpc("worksync_record_subscription_refund_provider", { p_refund: refundId, p_provider_refund_id: providerRefundId });
    if (saved.error || saved.data !== true) throw new PaymentError("Refund was sent but its reference could not be recorded. Review this transaction before retrying.");
    const refundStatus = verifiedRefundStatus(response.data, { providerPaymentId: row.provider_payment_id, providerRefundId, amountCentavos: cents, live: row.livemode });
    const finished = await db.rpc("worksync_finish_subscription_refund", { p_refund: refundId, p_status: refundStatus });
    if (finished.error || finished.data !== true) throw new PaymentError("Refund was sent and needs reconciliation before subscription access is updated.");
    return json({ status: refundStatus, message: refundStatus === "refunded" ? "Subscription payment refunded." : "Refund submitted to PayMongo and is pending confirmation." });
  } catch (error) {
    if (refundId && db) await db.rpc("worksync_finish_subscription_refund", { p_refund: refundId, p_status: "needs_review" });
    const response = paymentResponse(error);
    const body = await response.json();
    console.error("[admin/transactions/subscriptions] refund failed", { requestId, status: response.status, error: body.error });
    return json(body, response.status);
  }
}
