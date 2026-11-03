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
    const [profiles, users, refunds] = await Promise.all([
      userIds.length ? db.from("profiles").select("user_id,display_name").in("user_id", userIds) : Promise.resolve({ data: [], error: null }),
      userIds.length ? db.from("Users").select("user_id,email").in("user_id", userIds) : Promise.resolve({ data: [], error: null }),
      orderIds.length ? db.from("subscription_refunds").select("refund_id,order_id,amount,status,provider_refund_id,claimed_at,updated_at,refunded_at").in("order_id", orderIds).order("claimed_at") : Promise.resolve({ data: [], error: null }),
    ]);
    if (profiles.error || users.error || refunds.error) throw new PaymentError("Subscription transaction details are unavailable.");
    const names = new Map((profiles.data ?? []).map((row) => [row.user_id, row.display_name]));
    const emails = new Map((users.data ?? []).map((row) => [row.user_id, row.email]));
    const refundRows = new Map<string, typeof refunds.data>();
    for (const refund of refunds.data ?? []) {
      const rows = refundRows.get(refund.order_id) ?? [];
      rows.push(refund);
      refundRows.set(refund.order_id, rows);
    }
    return json({
      rows: orders.map((row) => ({
        payment_id: row.order_id, order_id: row.order_id, kind: "subscription", billing_period: row.billing_period,
        project_id: null, payer_id: row.user_id, amount: Number(row.amount), status: row.status,
        payment_method: null, transaction_reference: row.transaction_reference, provider: "PayMongo",
        livemode: row.livemode, currency: "PHP", provider_payment_id: row.provider_payment_id,
        created_at: row.created_at, updated_at: row.created_at, paid_at: row.paid_at, settlement_checked_at: null,
        platform_service_fee: null, platform_vat_amount: null, platform_tax_treatment: null,
        freelancer_service_vat_taxable_base: null, freelancer_service_vat_rate: null,
        freelancer_service_vat_amount: null, freelancer_service_vat_classification: null, freelancer_service_vat_rule: null,
        payer: { user_id: row.user_id, display_name: names.get(row.user_id) ?? null, email: emails.get(row.user_id) ?? null },
        project: null, refunds: refundRows.get(row.order_id) ?? [], receipt: null,
      })),
      total: page.count ?? 0, limit: pageSize, offset,
      summary: { total: page.count ?? 0, paid: paid.count ?? 0, pending: pending.count ?? 0 },
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
    const body = await request.json().catch(() => null) as { orderId?: unknown; reviewedUnused?: unknown } | null;
    if (body && typeof (body as { reconcileRefundId?: unknown }).reconcileRefundId === "string") {
      const refundKey = (body as { reconcileRefundId: string }).reconcileRefundId;
      if (!/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(refundKey)) throw new PaymentError("Choose a valid refund record.", 400);
      const { data: refund, error: refundError } = await db.from("subscription_refunds").select("refund_id,order_id,amount,status,provider_refund_id").eq("refund_id", refundKey).maybeSingle();
      if (refundError || !refund || !refund.provider_refund_id || !["pending", "needs_review"].includes(refund.status)) throw new PaymentError("This refund is not ready for provider reconciliation.", 409);
      const { data: order, error: orderError } = await db.from("subscription_orders").select("provider_payment_id,livemode").eq("order_id", refund.order_id).single();
      if (orderError || !order?.provider_payment_id || order.livemode !== (paymentMode() === "live")) throw new PaymentError("The refund payment environment requires review.", 409);
      const evidence = await transferRequest(`/v1/refunds/${encodeURIComponent(refund.provider_refund_id)}`);
      const reconciledStatus = verifiedRefundStatus(evidence.data, {
        providerPaymentId: order.provider_payment_id,
        providerRefundId: refund.provider_refund_id,
        amountCentavos: Math.round(Number(refund.amount) * 100),
        live: order.livemode,
      });
      const reconciled = await db.rpc("worksync_finish_subscription_refund", { p_refund: refund.refund_id, p_status: reconciledStatus });
      if (reconciled.error || reconciled.data !== true) throw new PaymentError("Refund status could not be recorded safely.");
      return json({ status: reconciledStatus, message: `Provider status: ${reconciledStatus.replaceAll("_", " ")}.` });
    }
    if (!body || typeof body.orderId !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(body.orderId)) throw new PaymentError("Choose a valid subscription transaction.", 400);
    if (body.reviewedUnused !== true) throw new PaymentError("Confirm that the support ticket was reviewed and no Premium-only benefit was used.", 400);

    const mode = paymentMode();
    const claim = await db.rpc("worksync_claim_subscription_refund", { p_order: body.orderId, p_reviewer: context.user.id, p_reviewed_unused: true });
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
