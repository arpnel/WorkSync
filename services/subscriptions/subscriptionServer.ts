import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateVat } from "@/lib/payments/philippineTax";
import {
  centavos,
  checkoutUrl,
  paymongo,
  paymentMode,
  PaymentError,
  type CheckoutSession,
} from "@/lib/payments/paymongo";

type Database = SupabaseClient;
type PaymentMode = ReturnType<typeof paymentMode>;
const orderIdPattern = /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

type OpenSubscriptionOrder = {
  order_id: string;
  amount: number;
  status: string;
  transaction_reference: string | null;
  checkout_url: string | null;
  livemode: boolean;
  billing_period: "monthly" | "yearly";
};

function hasCurrentPremiumLineItem(
  session: CheckoutSession,
  order: Pick<OpenSubscriptionOrder, "amount" | "billing_period">,
) {
  const [item] = session.attributes.line_items ?? [];
  const planName = `WorkSync Premium - 1 ${order.billing_period === "monthly" ? "month" : "year"}`;
  return (
    session.attributes.line_items?.length === 1 &&
    item?.name === planName &&
    item.amount === centavos(order.amount) &&
    item.currency === "PHP" &&
    item.quantity === 1
  );
}

async function resumeSubscriptionCheckout(
  db: Database,
  order: OpenSubscriptionOrder,
  mode: PaymentMode,
  billingPeriod: "monthly" | "yearly",
) {
  if (!order.transaction_reference) {
    if (order.status === "needs_review" && mode === "test" && !order.livemode) {
      const { error: closeError } = await db
        .from("subscription_orders")
        .update({ status: "failed" })
        .eq("order_id", order.order_id)
        .eq("status", "needs_review")
        .eq("livemode", false)
        .is("transaction_reference", null);
      if (closeError)
        throw new PaymentError("The previous test checkout could not be closed safely.");
      return null;
    }
    throw new PaymentError(
      "Your Premium checkout is still being confirmed. Retry shortly; do not start another payment.",
      409,
    );
  }

  const existing = await paymongo(
    `/v1/checkout_sessions/${encodeURIComponent(order.transaction_reference)}`,
  );
  if (existing.id !== order.transaction_reference ||
    existing.attributes.livemode !== order.livemode ||
    order.livemode !== (mode === "live"))
    throw new PaymentError("The existing Premium checkout needs support review.", 409);

  await processSubscriptionPaymentSession(db, existing);
  const { data: latest, error: latestError } = await db
    .from("subscription_orders")
    .select("status")
    .eq("order_id", order.order_id)
    .maybeSingle();
  if (latestError)
    throw new PaymentError("Unable to verify Premium checkout status.");
  if (latest?.status === "paid")
    throw new PaymentError("Premium was renewed. Refresh your subscription status.", 409);

  if (existing.attributes.status === "expired") {
    const { error: closeError } = await db
      .from("subscription_orders")
      .update({ status: "failed" })
      .eq("order_id", order.order_id)
      .eq("transaction_reference", existing.id)
      .eq("status", order.status);
    if (closeError)
      throw new PaymentError("Expired Premium checkout could not be closed safely.");
    return null;
  }

  if (order.billing_period === billingPeriod && hasCurrentPremiumLineItem(existing, order)) {
    const url = checkoutUrl(existing);
    if (order.status === "needs_review") {
      const { error } = await db
        .from("subscription_orders")
        .update({ status: "pending", checkout_url: url })
        .eq("order_id", order.order_id)
        .eq("transaction_reference", existing.id)
        .eq("status", "needs_review");
      if (error)
        throw new PaymentError("The existing Premium checkout could not be restored safely.");
    } else if (order.checkout_url && order.checkout_url !== url) {
      throw new PaymentError("The existing Premium checkout needs support review.", 409);
    }
    return { checkoutUrl: url, orderId: order.order_id };
  }

  // Checkout line items cannot be edited after creation. Expire an older
  // session before issuing a replacement so the customer cannot pay twice.
  if (existing.attributes.status !== "expired") {
    const expired = await paymongo(
      `/v1/checkout_sessions/${encodeURIComponent(existing.id)}/expire`,
      {},
    );
    if (expired.id !== existing.id || expired.attributes.status !== "expired")
      throw new PaymentError("The previous Premium checkout could not be safely replaced.", 409);
  }
  const { error: closeError } = await db
    .from("subscription_orders")
    .update({ status: "failed" })
    .eq("order_id", order.order_id)
    .eq("transaction_reference", existing.id)
    .eq("status", order.status);
  if (closeError)
    throw new PaymentError("The previous Premium checkout could not be closed safely.");
  return null;
}

export async function createSubscriptionCheckout(
  db: Database,
  userId: string,
  origin: string,
  billingPeriod: "monthly" | "yearly" = "monthly",
) {
  const mode = paymentMode();
  const { data: plan, error: planError } = await db
    .from("subscription_plans")
    .select("provisional_monthly_price,provisional_annual_price")
    .eq("plan_code", "pro")
    .single();
  const configuredPrice = billingPeriod === "monthly"
    ? plan?.provisional_monthly_price
    : plan?.provisional_annual_price;
  if (planError || configuredPrice == null)
    throw new PaymentError("Premium billing is not configured yet.", 503);
  // The displayed subscription price is VAT-exclusive. Add VAT on top and
  // use that same total for the checkout and receipt line items.
  const vat = calculateVat(configuredPrice, "exclusive", true);
  const amount = centavos(vat.total);
  const baseAmount = centavos(vat.taxableAmount);
  const vatAmount = centavos(vat.vatAmount);

  const { data: pending, error: pendingError } = await db
    .from("subscription_orders")
    .select("order_id,amount,status,transaction_reference,checkout_url,livemode,billing_period")
    .eq("user_id", userId)
    .in("status", ["pending", "needs_review"])
    .maybeSingle();
  if (pendingError)
    throw new PaymentError("Unable to check for an existing Premium checkout.");
  if (pending) {
    const resumed = await resumeSubscriptionCheckout(db, pending, mode, billingPeriod);
    if (resumed) return resumed;
  }

  const orderId = crypto.randomUUID();
  const { error: reserveError } = await db.from("subscription_orders").insert({
    order_id: orderId,
    user_id: userId,
    amount: amount / 100,
    taxable_amount: baseAmount / 100,
    vat_amount: vatAmount / 100,
    vat_rate: 0.12,
    vat_itemized: true,
    billing_period: billingPeriod,
    status: "pending",
    livemode: mode === "live",
  });
  if (reserveError?.code === "23505") {
    const { data: winner, error } = await db
      .from("subscription_orders")
      .select("order_id,amount,status,transaction_reference,checkout_url,livemode,billing_period")
      .eq("user_id", userId)
      .in("status", ["pending", "needs_review"])
      .maybeSingle();
    if (error)
      throw new PaymentError("Unable to check the existing Premium checkout.");
    if (winner) {
      const resumed = await resumeSubscriptionCheckout(db, winner, mode, billingPeriod);
      if (resumed) return resumed;
    }
  }
  if (reserveError)
    throw new PaymentError(
      "Premium checkout could not be reserved. Please try again.",
      409,
    );

  const returnUrl = `${origin}/home/subscription?order=${encodeURIComponent(orderId)}`;
  let sessionBoundToOrder = false;
  try {
    const session = await paymongo("/v2/checkout_sessions", {
      line_items: [
        {
          name: `WorkSync Premium - 1 ${billingPeriod === "monthly" ? "month" : "year"}`,
          amount,
          currency: "PHP",
          quantity: 1,
        },
      ],
      show_line_items: true,
      payment_method_types: (process.env.PAYMONGO_PAYMENT_METHODS || "gcash,card,qrph")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      success_url: returnUrl,
      cancel_url: `${returnUrl}&cancelled=1`,
      reference_number: orderId,
      metadata: { kind: "subscription", order_id: orderId, user_id: userId, billing_period: billingPeriod },
      send_email_receipt: true,
    });
    if (!/^cs_[a-zA-Z0-9]+$/.test(session.id))
      throw new PaymentError("PayMongo returned an invalid checkout session ID.");
    const { error: saveError } = await db
      .from("subscription_orders")
      .update({ transaction_reference: session.id })
      .eq("order_id", orderId)
      .eq("status", "pending");
    if (saveError)
      throw new PaymentError(
        "Checkout was created but its reference could not be saved. Contact support before retrying.",
      );
    sessionBoundToOrder = true;
    if (session.attributes.livemode !== (mode === "live"))
      throw new PaymentError("PayMongo returned a checkout session in the wrong payment mode.");
    const url = checkoutUrl(session);
    const { error: urlSaveError } = await db
      .from("subscription_orders")
      .update({ checkout_url: url })
      .eq("order_id", orderId)
      .eq("transaction_reference", session.id)
      .eq("status", "pending");
    if (urlSaveError)
      throw new PaymentError("Checkout was created but its link could not be saved. Retry shortly.");
    return { checkoutUrl: url, orderId };
  } catch (error) {
    // If PayMongo returned a session, retain the order binding and do not
    // create a second payable session when validation or link saving fails.
    if (sessionBoundToOrder)
      await db
        .from("subscription_orders")
        .update({ status: "needs_review" })
        .eq("order_id", orderId)
        .eq("status", "pending");
    throw error;
  }
}

export async function processSubscriptionPaymentSession(
  db: Database,
  session: CheckoutSession,
  requirePaid = false,
): Promise<boolean> {
  const attributes = session.attributes;
  const { data: order, error } = await db
    .from("subscription_orders")
    .select("order_id,user_id,amount,taxable_amount,vat_amount,vat_rate,vat_itemized,status,transaction_reference,livemode,provider_payment_id,billing_period,legacy_price")
    .eq("transaction_reference", session.id)
    .maybeSingle();
  if (error)
    throw new PaymentError("Unable to verify the Premium checkout record.");
  if (!order) {
    // Other checkout types also reach this processor. Only claim an unbound
    // session as a subscription when its metadata explicitly says so.
    if (attributes.metadata?.kind !== "subscription") return false;
    throw new PaymentError("Premium checkout record was not found.", 404);
  }
  if (
    !orderIdPattern.test(order.order_id) ||
    attributes.livemode !== order.livemode ||
    order.livemode !== (paymentMode() === "live")
  )
    throw new PaymentError("Premium checkout details do not match.", 409);
  const paid = attributes.payments?.find(
    (payment) => payment.attributes.status === "paid",
  );
  if (!paid) {
    if (requirePaid)
      throw new PaymentError("PayMongo has not confirmed the Premium payment yet.", 409);
    return true;
  }
  if (
    !/^pay_[a-zA-Z0-9]+$/.test(paid.id) ||
    (order.provider_payment_id && order.provider_payment_id !== paid.id) ||
    (order.vat_itemized &&
      (centavos(order.taxable_amount) + centavos(order.vat_amount) !== centavos(order.amount) ||
        order.vat_rate !== 0.12)) ||
    paid.attributes.amount !== centavos(order.amount) ||
    paid.attributes.currency !== "PHP" ||
    (paid.attributes.livemode !== undefined &&
      paid.attributes.livemode !== attributes.livemode)
  )
    throw new PaymentError("Premium payment amount or currency does not match.", 409);
  const paidAt =
    typeof paid.attributes.paid_at === "number" &&
    Number.isFinite(paid.attributes.paid_at) &&
    paid.attributes.paid_at > 0 &&
    paid.attributes.paid_at < 8640000000000
      ? new Date(paid.attributes.paid_at * 1000).toISOString()
      : new Date().toISOString();
  const { data: confirmed, error: confirmError } = await db.rpc(
    "worksync_confirm_subscription_payment",
    {
      p_order: order.order_id,
      p_session: session.id,
      p_payment: paid.id,
      p_paid_at: paidAt,
    },
  );
  if (confirmError || confirmed !== true)
    throw new PaymentError("Payment received but Premium could not be activated.");
  return true;
}

export async function getSubscriptionCheckoutStatus(
  db: Database,
  userId: string,
  orderId: string,
) {
  if (!orderIdPattern.test(orderId))
    throw new PaymentError("Invalid Premium checkout reference.", 400);
  const { data: order, error } = await db
    .from("subscription_orders")
    .select("order_id,status,transaction_reference,livemode")
    .eq("order_id", orderId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !order)
    throw new PaymentError("Premium checkout not found.", 404);
  if (order.status === "pending" && order.transaction_reference) {
    const session = await paymongo(
      `/v1/checkout_sessions/${encodeURIComponent(order.transaction_reference)}`,
    );
    await processSubscriptionPaymentSession(db, session);
    const { data: latest } = await db
      .from("subscription_orders")
      .select("status")
      .eq("order_id", orderId)
      .maybeSingle();
    return { orderId, status: latest?.status ?? order.status };
  }
  return { orderId, status: order.status };
}

export async function getSubscriptionPaymentHistory(db: Database, userId: string) {
  const { data, error } = await db
    .from("subscription_orders")
    .select("order_id,amount,billing_period,paid_at,created_at,status")
    .eq("user_id", userId)
    .in("status", ["paid", "refunded"])
    .order("paid_at", { ascending: false, nullsFirst: false })
    .limit(50);
  if (error)
    throw new PaymentError("Unable to load Premium payment history.");
  return data ?? [];
}
