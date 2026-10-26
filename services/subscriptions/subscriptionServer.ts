import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  centavos,
  checkoutUrl,
  paymongo,
  paymentMode,
  PaymentError,
  type CheckoutSession,
} from "@/lib/payments/paymongo";

type Database = SupabaseClient;
const orderIdPattern = /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

type OpenSubscriptionOrder = {
  order_id: string;
  amount: number;
  status: string;
  transaction_reference: string | null;
  checkout_url: string | null;
  livemode: boolean;
};

async function resumeSubscriptionCheckout(
  db: Database,
  userId: string,
  order: OpenSubscriptionOrder,
  mode: "test" | "live",
) {
  if (order.status === "needs_review")
    throw new PaymentError(
      "Your previous Premium checkout needs support review before another can be started.",
      409,
    );
  if (!order.transaction_reference)
    throw new PaymentError(
      "Your Premium checkout is still being confirmed. Retry shortly; do not start another payment.",
      409,
    );

  const existing = await paymongo(
    `/v1/checkout_sessions/${encodeURIComponent(order.transaction_reference)}`,
  );
  if (
    existing.id !== order.transaction_reference ||
    existing.attributes.reference_number !== order.order_id ||
    existing.attributes.metadata?.kind !== "subscription" ||
    existing.attributes.metadata?.user_id !== userId ||
    existing.attributes.livemode !== order.livemode ||
    order.livemode !== (mode === "live")
  )
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
    const { error } = await db
      .from("subscription_orders")
      .update({ status: "failed" })
      .eq("order_id", order.order_id)
      .eq("status", "pending");
    if (error)
      throw new PaymentError("Expired Premium checkout could not be closed safely.");
    return null;
  }

  const url = checkoutUrl(existing);
  if (order.checkout_url && order.checkout_url !== url)
    throw new PaymentError("The existing Premium checkout needs support review.", 409);
  if (!order.checkout_url) {
    const { error } = await db
      .from("subscription_orders")
      .update({ checkout_url: url })
      .eq("order_id", order.order_id)
      .eq("status", "pending");
    if (error)
      throw new PaymentError("Checkout URL could not be saved safely.");
  }
  return { checkoutUrl: url, orderId: order.order_id };
}

export async function createSubscriptionCheckout(
  db: Database,
  userId: string,
  origin: string,
) {
  const mode = paymentMode();
  const { data: plan, error: planError } = await db
    .from("subscription_plans")
    .select("provisional_monthly_price")
    .eq("plan_code", "pro")
    .single();
  if (planError || plan?.provisional_monthly_price == null)
    throw new PaymentError("Premium billing is not configured yet.", 503);
  const amount = centavos(plan.provisional_monthly_price);

  const { data: pending, error: pendingError } = await db
    .from("subscription_orders")
    .select("order_id,amount,status,transaction_reference,checkout_url,livemode")
    .eq("user_id", userId)
    .in("status", ["pending", "needs_review"])
    .maybeSingle();
  if (pendingError)
    throw new PaymentError("Unable to check for an existing Premium checkout.");
  if (pending) {
    const resumed = await resumeSubscriptionCheckout(db, userId, pending, mode);
    if (resumed) return resumed;
  }

  const orderId = crypto.randomUUID();
  const { error: reserveError } = await db.from("subscription_orders").insert({
    order_id: orderId,
    user_id: userId,
    amount: amount / 100,
    status: "pending",
    livemode: mode === "live",
  });
  if (reserveError?.code === "23505") {
    const { data: winner, error } = await db
      .from("subscription_orders")
      .select("order_id,amount,status,transaction_reference,checkout_url,livemode")
      .eq("user_id", userId)
      .in("status", ["pending", "needs_review"])
      .maybeSingle();
    if (error)
      throw new PaymentError("Unable to check the existing Premium checkout.");
    if (winner) {
      const resumed = await resumeSubscriptionCheckout(db, userId, winner, mode);
      if (resumed) return resumed;
    }
  }
  if (reserveError)
    throw new PaymentError(
      "Premium checkout could not be reserved. Please try again.",
      409,
    );

  const returnUrl = `${origin}/home/subscription?order=${encodeURIComponent(orderId)}`;
  try {
    const session = await paymongo("/v2/checkout_sessions", {
      line_items: [
        {
          name: "WorkSync Premium - 1 month",
          amount,
          currency: "PHP",
          quantity: 1,
        },
      ],
      payment_method_types: (process.env.PAYMONGO_PAYMENT_METHODS || "gcash,card,qrph")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      success_url: returnUrl,
      cancel_url: `${returnUrl}&cancelled=1`,
      reference_number: orderId,
      metadata: { kind: "subscription", order_id: orderId, user_id: userId },
      send_email_receipt: true,
    });
    if (
      session.attributes.reference_number !== orderId ||
      session.attributes.livemode !== (mode === "live")
    )
      throw new PaymentError("PayMongo returned a mismatched checkout session.");
    const url = checkoutUrl(session);
    const { error: saveError } = await db
      .from("subscription_orders")
      .update({ transaction_reference: session.id, checkout_url: url })
      .eq("order_id", orderId)
      .eq("status", "pending");
    if (saveError)
      throw new PaymentError(
        "Checkout was created but its reference could not be saved. Contact support before retrying.",
      );
    return { checkoutUrl: url, orderId };
  } catch (error) {
    // An ambiguous provider timeout must not create another payable session on retry.
    if (error instanceof PaymentError && error.message.includes("mismatched"))
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
  const metadata = attributes.metadata;
  if (metadata?.kind !== "subscription") return false;
  const orderId = metadata.order_id;
  const userId = metadata.user_id;
  if (!orderIdPattern.test(orderId ?? "") || !userId)
    throw new PaymentError("Invalid Premium checkout metadata.", 409);
  const { data: order, error } = await db
    .from("subscription_orders")
    .select("order_id,user_id,amount,status,transaction_reference,livemode,provider_payment_id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error || !order)
    throw new PaymentError("Premium checkout record was not found.", 404);
  if (
    order.user_id !== userId ||
    attributes.reference_number !== order.order_id ||
    (order.transaction_reference && order.transaction_reference !== session.id) ||
    metadata.order_id !== order.order_id ||
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
