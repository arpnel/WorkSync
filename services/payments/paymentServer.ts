import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  PaymentError,
  paymentMode,
  paymentId,
  centavos,
  paymongo,
  checkoutUrl,
  type CheckoutSession,
} from "@/lib/payments/paymongo";

export function paymentDatabase() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new PaymentError("Payment storage is not configured.");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function paymentUser(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new PaymentError("Sign in to view payments.", 401);
  const db = paymentDatabase();
  const {
    data: { user },
    error,
  } = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).auth.getUser(token);
  if (error && /api.?key/i.test(error.message))
    throw new PaymentError(
      "Server authentication is misconfigured. Check the Supabase environment variables in Vercel.",
      503,
    );
  if (error && ![400, 401, 403].includes(error.status ?? 0))
    throw new PaymentError(
      "Unable to verify your session. Please try again shortly.",
      503,
    );
  if (error || !user)
    throw new PaymentError("Your session expired. Sign in again.", 401);
  return { db, user };
}
type DB = ReturnType<typeof paymentDatabase>;
interface PaymentRow {
  payment_id: string;
  project_id: string;
  order_id: string | null;
  payer_id: string;
  amount: number;
  status: string;
  transaction_reference: string | null;
  payment_method: string | null;
}
async function storageReady(db: DB) {
  const { data, error } = await db.rpc("worksync_payment_storage_ready");
  if (error || data !== true)
    throw new PaymentError(
      "Payments are not enabled yet. Please contact WorkSync support.",
    );
}
async function projectForUser(db: DB, projectId: string, userId: string) {
  const { data: project, error } = await db
    .from("projects")
    .select(
      "project_id,order_id,application_id,client_id,freelancer_id,title,budget,status",
    )
    .eq("project_id", projectId)
    .maybeSingle();
  if (error || !project) throw new PaymentError("Project unavailable.", 404);
  const [client, freelancer] = await Promise.all([
    db
      .from("client_profiles")
      .select("user_id")
      .eq("client_id", project.client_id)
      .single(),
    db
      .from("freelancer_profiles")
      .select("user_id")
      .eq("freelancer_id", project.freelancer_id)
      .single(),
  ]);
  if (client.error || freelancer.error)
    throw new PaymentError("Project participants unavailable.");
  if (userId !== client.data.user_id && userId !== freelancer.data.user_id)
    throw new PaymentError(
      "Only project participants can view this payment.",
      403,
    );
  return { project, isClient: userId === client.data.user_id };
}
async function findPayment(db: DB, id: string) {
  const { data, error } = await db
    .from("payments")
    .select(
      "payment_id,project_id,order_id,payer_id,amount,status,transaction_reference,payment_method",
    )
    .eq("payment_id", id)
    .maybeSingle();
  if (error) throw new PaymentError("Payment records could not be loaded.");
  return data as PaymentRow | null;
}
export async function reconcilePayment(
  db: DB,
  row: PaymentRow,
  session: CheckoutSession,
) {
  const a = session.attributes;
  if (
    session.id !== row.transaction_reference &&
    row.transaction_reference !== null
  )
    throw new PaymentError("Payment session mismatch.", 409);
  if (
    a.reference_number !== row.payment_id ||
    a.metadata?.project_id !== row.project_id ||
    a.metadata?.payer_id !== row.payer_id ||
    a.livemode !== (paymentMode() === "live")
  )
    throw new PaymentError("Payment details do not match the project.", 409);
  const paid = a.payments?.find((p) => p.attributes.status === "paid");
  if (!paid) return false;
  if (
    paid.attributes.amount !== centavos(row.amount) ||
    paid.attributes.currency !== "PHP" ||
    (paid.attributes.livemode !== undefined &&
      paid.attributes.livemode !== a.livemode)
  )
    throw new PaymentError(
      "Payment amount or currency does not match the agreement.",
      409,
    );
  const { error } = await db
    .from("payments")
    .update({
      status: "paid",
      payment_method: paid.attributes.source?.type ?? "paymongo",
      transaction_reference: session.id,
    })
    .eq("payment_id", row.payment_id);
  if (error)
    throw new PaymentError(
      "Payment received but its record could not be updated. Refresh payment status.",
    );
  return true;
}
export async function getProjectPayment(
  db: DB,
  projectId: string,
  userId: string,
) {
  await projectForUser(db, projectId, userId);
  await storageReady(db);
  const row = await findPayment(db, paymentId(projectId));
  if (!row) return { status: "unpaid", mode: paymentMode() };
  let paid = row.status === "paid";
  let paidAt: string | null = null;
  if (row.transaction_reference) {
    const session = await paymongo(
      `/v1/checkout_sessions/${encodeURIComponent(row.transaction_reference)}`,
    );
    paid = await reconcilePayment(db, row, session);
    const timestamp = session.attributes.payments?.find(
      (payment) => payment.attributes.status === "paid",
    )?.attributes.paid_at;
    if (
      paid &&
      typeof timestamp === "number" &&
      Number.isFinite(timestamp) &&
      timestamp > 0 &&
      timestamp < 8640000000000
    )
      paidAt = new Date(timestamp * 1000).toISOString();
  }
  return {
    status: paid
      ? "paid"
      : row.transaction_reference
        ? "pending"
        : "processing",
    amount: row.amount,
    paidAt,
    mode: paymentMode(),
  };
}
export async function createProjectCheckout(
  db: DB,
  projectId: string,
  userId: string,
  origin: string,
) {
  const { project, isClient } = await projectForUser(db, projectId, userId);
  if (!isClient)
    throw new PaymentError("Only the project client can pay.", 403);
  await storageReady(db);
  if (!["active", "revision", "completed"].includes(project.status))
    throw new PaymentError(
      "Payment is available after both participants sign the agreement.",
      409,
    );
  const [disputes, cancellations] = await Promise.all([
    db
      .from("project_disputes")
      .select("dispute_id")
      .eq("project_id", projectId)
      .in("status", ["open", "under_review"])
      .limit(1),
    project.order_id
      ? db
          .from("project_cancellations")
          .select("cancellation_id")
          .eq("order_id", project.order_id)
          .eq("status", "requested")
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (disputes.error || cancellations.error)
    throw new PaymentError("Could not check whether this project is on hold.");
  if (disputes.data?.length || cancellations.data?.length)
    throw new PaymentError(
      "Resolve the open dispute or cancellation before paying.",
      409,
    );
  const contracts = db
    .from("contracts")
    .select("final_price,client_signed_at,freelancer_signed_at,status");
  const { data: contract, error } = project.order_id
    ? await contracts.eq("order_id", project.order_id).single()
    : await contracts.eq("application_id", project.application_id).single();
  if (
    error ||
    !contract?.client_signed_at ||
    !contract.freelancer_signed_at ||
    !["active", "completed"].includes(contract.status)
  )
    throw new PaymentError(
      "A signed agreement is required before payment.",
      409,
    );
  const amount = centavos(contract.final_price);
  const id = paymentId(projectId);
  const existing = await findPayment(db, id);
  if (existing) {
    if (existing.status === "paid")
      throw new PaymentError("This project is already paid.", 409);
    if (!existing.transaction_reference)
      throw new PaymentError(
        "A checkout request is still being confirmed. Contact support if it remains pending; do not create another payment.",
        409,
      );
    const session = await paymongo(
      `/v1/checkout_sessions/${encodeURIComponent(existing.transaction_reference)}`,
    );
    if (await reconcilePayment(db, existing, session))
      throw new PaymentError("This project is already paid.", 409);
    if (centavos(existing.amount) !== amount)
      throw new PaymentError(
        "The agreement changed. Contact support before paying.",
        409,
      );
    return { checkoutUrl: checkoutUrl(session) };
  }
  const { data: otherPayments, error: otherError } = await db
    .from("payments")
    .select("payment_id")
    .eq("project_id", projectId);
  if (otherError)
    throw new PaymentError("Could not check existing project payments.");
  const integrationIds = [
    paymentId(projectId, "test"),
    paymentId(projectId, "live"),
  ];
  if (otherPayments?.some((row) => !integrationIds.includes(row.payment_id)))
    throw new PaymentError(
      "This project has an existing payment record. Contact support to reconcile it before starting another checkout.",
      409,
    );
  // The primary key is a durable, cross-process reservation for one full-project payment per mode.
  const { error: insertError } = await db.from("payments").insert({
    payment_id: id,
    project_id: projectId,
    order_id: project.order_id,
    payer_id: userId,
    amount: amount / 100,
    status: "pending",
    payment_method: "paymongo",
  });
  if (insertError)
    throw new PaymentError(
      insertError.code === "23505"
        ? "Checkout is already being prepared. Refresh payment status."
        : "Payment reservation failed. Check payment table constraints.",
      409,
    );
  const returnUrl = `${origin}/home/payments/return?payment=${encodeURIComponent(projectId)}`;
  // Never retry an ambiguous POST: it may have created a payable provider session.
  const session = await paymongo("/v2/checkout_sessions", {
    line_items: [
      {
        name: project.title.slice(0, 200),
        amount,
        currency: "PHP",
        quantity: 1,
      },
    ],
    payment_method_types: (
      process.env.PAYMONGO_PAYMENT_METHODS || "gcash,card,qrph"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    success_url: returnUrl,
    cancel_url: `${returnUrl}&cancelled=1`,
    reference_number: id,
    metadata: { project_id: projectId, payer_id: userId },
    send_email_receipt: true,
  });
  const url = checkoutUrl(session);
  const { error: saveError } = await db
    .from("payments")
    .update({ transaction_reference: session.id })
    .eq("payment_id", id)
    .is("transaction_reference", null);
  if (saveError)
    throw new PaymentError(
      "Checkout was created but could not be saved. Contact support before retrying.",
    );
  return { checkoutUrl: url };
}
export async function processPaymentWebhook(sessionId: string) {
  const db = paymentDatabase();
  await storageReady(db);
  // Retrieve independently; signed webhook bodies are not used as payment evidence.
  const session = await paymongo(
    `/v1/checkout_sessions/${encodeURIComponent(sessionId)}`,
  );
  const id = session.attributes.reference_number;
  if (!/^[a-f\d-]{36}$/i.test(id ?? "")) return;
  const row = await findPayment(db, id);
  if (!row) return; // Another integration on this merchant account.
  await reconcilePayment(db, row, session);
}
export function paymentResponse(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof PaymentError
          ? error.message
          : "Payment service is temporarily unavailable.",
    },
    {
      status: error instanceof PaymentError ? error.status : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
