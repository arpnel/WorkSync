import "server-only";
import { notifyPaymentConfirmed } from "@/services/email/paymentEmails";
import { processSubscriptionPaymentSession } from "@/services/subscriptions/subscriptionServer";
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
import { calculateVat } from "@/lib/payments/philippineTax";

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
      false,
      { code: error.code, status: error.status, message: error.message },
    );
  if (error && ![400, 401, 403].includes(error.status ?? 0))
    throw new PaymentError(
      "Unable to verify your session. Please try again shortly.",
      503,
      false,
      { code: error.code, status: error.status, message: error.message },
    );
  if (error || !user)
    throw new PaymentError("Your session expired. Sign in again.", 401, false, {
      code:
        error?.code ??
        (error ? "auth_error" : user ? undefined : "user_missing"),
      status: error?.status ?? 401,
      message: error?.message,
    });
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
  provider_payment_id?: string | null;
  freelancer_service_vat_taxable_base?: number | null;
  freelancer_service_vat_rate?: number | null;
  freelancer_service_vat_amount?: number | null;
  freelancer_service_vat_classification?: string | null;
  freelancer_service_vat_document_id?: string | null;
  freelancer_service_vat_rule?: string | null;
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
  return {
    project,
    isClient: userId === client.data.user_id,
    freelancerUserId: freelancer.data.user_id,
  };
}

async function agreedProjectBasePrice(
  db: DB,
  project: {
    order_id: string | null;
    application_id: string | null;
    budget: number;
  },
) {
  const query = db.from("contracts").select("final_price");
  const result = project.order_id
    ? await query
        .eq("order_id", project.order_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : await query
        .eq("application_id", project.application_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
  if (result.error)
    throw new PaymentError("The agreed project amount could not be loaded.");
  return Number(result.data?.final_price ?? project.budget);
}

type ProjectVatBreakdown = {
  status:
    | "applicable"
    | "not_applicable"
    | "review_required"
    | "not_recorded"
    | "unavailable";
  taxableAmount: number | null;
  amount: number | null;
  rate: number | null;
  total: number | null;
  classification?: string | null;
  documentId?: string | null;
  reviewNotice?: string | null;
};

async function getProjectVatBreakdown(
  db: DB,
  freelancerUserId: string,
  baseAmount: number,
): Promise<ProjectVatBreakdown> {
  const profile = await db
    .from("freelancer_tax_profiles")
    .select("freelancer_vat_applicable,vat_classification")
    .eq("user_id", freelancerUserId)
    .maybeSingle();
  if (profile.error)
    return {
      status: "unavailable",
      taxableAmount: null,
      amount: null,
      rate: null,
      total: null,
    };
  const classification = profile.data?.vat_classification ?? null;
  const vatApplicable = profile.data?.freelancer_vat_applicable;

  const today = new Date().toISOString().slice(0, 10);
  const cor = await db
    .from("tax_documents")
    .select("document_id")
    .eq("user_id", freelancerUserId)
    .eq("party_type", "freelancer")
    .eq("document_type", "bir_cor")
    .eq("is_canonical_bir_cor", true)
    .eq("status", "verified")
    .or(`expires_at.is.null,expires_at.gte.${today}`)
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cor.error)
    return {
      status: "unavailable",
      taxableAmount: null,
      amount: null,
      rate: null,
      total: null,
    };
  if (!cor.data)
    return {
      status: "review_required",
      taxableAmount: null,
      amount: null,
      rate: null,
      total: null,
      classification: classification ?? "unverified",
      reviewNotice:
        "The freelancer's required Form 2303 seller verification must be approved before checkout.",
    };
  const corDocumentId = cor.data.document_id as string;
  const consistentVatRegistered =
    classification === "vat_registered" && vatApplicable === true;
  const consistentNonVat =
    classification === "non_vat" && vatApplicable === false;
  if (consistentNonVat) {
    const parts = calculateVat(baseAmount, "exclusive", false);
    return {
      status: "not_applicable",
      taxableAmount: parts.taxableAmount,
      amount: parts.vatAmount,
      rate: 0,
      total: parts.total,
      classification,
      documentId: corDocumentId,
    };
  }

  if (consistentVatRegistered) {
    const proof = await db
      .from("tax_documents")
      .select("document_id")
      .eq("user_id", freelancerUserId)
      .eq("party_type", "freelancer")
      .eq("document_type", "vat_registration")
      .eq("status", "verified")
      .or(`expires_at.is.null,expires_at.gte.${today}`)
      .order("reviewed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (proof.error)
      return {
        status: "unavailable",
        taxableAmount: null,
        amount: null,
        rate: null,
        total: null,
      };
    if (proof.data) {
      const parts = calculateVat(baseAmount, "exclusive", true);
      return {
        status: "applicable",
        taxableAmount: parts.taxableAmount,
        amount: parts.vatAmount,
        rate: 0.12,
        total: parts.total,
        classification,
        documentId: proof.data.document_id as string,
      };
    }
  }
  // A verified Form 2303 satisfies the existing seller tax-document gate.
  // Unless a reviewed non-VAT classification qualifies for the zero-rate path,
  // default to the established 12% treatment. Record the fallback as a
  // correction signal so administrators can review missing or inconsistent
  // VAT profile data without blocking the client's payment.
  const parts = calculateVat(baseAmount, "exclusive", true);
  return {
    status: "applicable",
    taxableAmount: parts.taxableAmount,
    amount: parts.vatAmount,
    rate: 0.12,
    total: parts.total,
    classification: "default_vat",
    documentId: corDocumentId,
    reviewNotice:
      "Default 12% VAT is being applied. The freelancer's saved VAT treatment may need administrator review.",
  };
}

async function requireEligibleFreelancerSeller(
  db: DB,
  freelancerUserId: string,
) {
  const result = await db.rpc("worksync_freelancer_seller_eligible", {
    p_user: freelancerUserId,
  });
  if (result.error)
    throw new PaymentError(
      "Freelancer seller approval could not be verified. Contact support before checkout.",
      503,
    );
  if (result.data !== true)
    throw new PaymentError(
      "The freelancer has not completed required seller verification, so checkout is unavailable.",
      409,
    );
}
async function findPayment(db: DB, id: string) {
  const { data, error } = await db
    .from("payments")
    .select(
      "payment_id,project_id,order_id,payer_id,amount,status,transaction_reference,payment_method,provider_payment_id,freelancer_service_vat_taxable_base,freelancer_service_vat_rate,freelancer_service_vat_amount,freelancer_service_vat_classification,freelancer_service_vat_document_id,freelancer_service_vat_rule",
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
  if (!["pending", "paid"].includes(row.status))
    throw new PaymentError("Payment requires support reconciliation.", 409);
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
    typeof paid.id !== "string" ||
    !/^pay_[a-zA-Z0-9]+$/.test(paid.id) ||
    (row.provider_payment_id != null && row.provider_payment_id !== paid.id) ||
    paid.attributes.amount !== centavos(row.amount) ||
    paid.attributes.currency !== "PHP" ||
    (paid.attributes.livemode !== undefined &&
      paid.attributes.livemode !== a.livemode)
  )
    throw new PaymentError(
      "Payment amount or currency does not match the agreement.",
      409,
    );
  const { data: saved, error } = await db
    .from("payments")
    .update({
      status: "paid",
      payment_method: paid.attributes.source?.type ?? "paymongo",
      transaction_reference: session.id,
      provider_payment_id: paid.id,
      provider: "paymongo",
      livemode: a.livemode,
      currency: "PHP",
      ...(typeof paid.attributes.paid_at === "number" &&
      Number.isFinite(paid.attributes.paid_at) &&
      paid.attributes.paid_at > 0 &&
      paid.attributes.paid_at < 8640000000000
        ? { paid_at: new Date(paid.attributes.paid_at * 1000).toISOString() }
        : {}),
    })
    .eq("payment_id", row.payment_id)
    .in("status", ["pending", "paid"])
    .select("payment_id")
    .maybeSingle();
  if (error || !saved)
    throw new PaymentError(
      "Payment received but its record could not be updated. Refresh payment status.",
    );
  if (row.status !== "paid") {
    try {
      await notifyPaymentConfirmed(
        row.payment_id,
        row.project_id,
        row.payer_id,
      );
    } catch {
      console.error("Could not prepare payment confirmation email", {
        kind: "payment_confirmed",
      });
    }
  }
  return true;
}
export async function getProjectPayment(
  db: DB,
  projectId: string,
  userId: string,
) {
  const { project, freelancerUserId } = await projectForUser(
    db,
    projectId,
    userId,
  );
  await storageReady(db);
  const row = await findPayment(db, paymentId(projectId));
  const basePrice = row
    ? Number(project.budget)
    : await agreedProjectBasePrice(db, project);
  const snapshotVat = row
    ? row.freelancer_service_vat_taxable_base == null
      ? {
          status: "not_recorded" as const,
          taxableAmount: null,
          amount: null,
          rate: null,
          total: null,
        }
      : {
          status:
            Number(row.freelancer_service_vat_rate ?? 0) > 0
              ? ("applicable" as const)
              : ("not_applicable" as const),
          taxableAmount: Number(row.freelancer_service_vat_taxable_base),
          amount: Number(row.freelancer_service_vat_amount ?? 0),
          rate: Number(row.freelancer_service_vat_rate ?? 0),
          total: Number(row.amount),
        }
    : await getProjectVatBreakdown(db, freelancerUserId, basePrice);
  // A client only needs the transaction breakdown, never document identifiers.
  const vatBreakdown = {
    status: snapshotVat.status,
    taxableAmount: snapshotVat.taxableAmount,
    amount: snapshotVat.amount,
    rate: snapshotVat.rate,
    total: snapshotVat.total,
    reviewNotice:
      "reviewNotice" in snapshotVat
        ? snapshotVat.reviewNotice
        : row?.freelancer_service_vat_classification === "default_vat"
          ? "Default 12% VAT is being applied. The freelancer's saved VAT treatment may need administrator review."
          : null,
  };
  if (!row) {
    const sellerEligibility = await db.rpc(
      "worksync_freelancer_seller_eligible",
      {
        p_user: freelancerUserId,
      },
    );
    if (sellerEligibility.error)
      throw new PaymentError(
        "Freelancer seller approval could not be verified. Contact support before checkout.",
        503,
      );
    return {
      status: "unpaid",
      mode: paymentMode(),
      vatBreakdown,
      amount: vatBreakdown.total ?? basePrice,
      checkoutAllowed:
        sellerEligibility.data === true &&
        (vatBreakdown.status === "applicable" ||
          vatBreakdown.status === "not_applicable"),
      checkoutMessage:
        sellerEligibility.data !== true
          ? "The freelancer has not completed required seller verification, so checkout is unavailable."
          : vatBreakdown.status === "review_required"
            ? (snapshotVat.reviewNotice ??
              "The freelancer's required Form 2303 seller verification must be approved before checkout.")
            : vatBreakdown.status === "unavailable"
              ? "The freelancer's VAT treatment could not be verified. Contact support before checkout."
              : undefined,
    };
  }
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
  const version = await db.rpc("worksync_settlement_version");
  const settlementVersion =
    !version.error && Number.isInteger(version.data) ? Number(version.data) : 1;
  const upgraded = settlementVersion >= 2;
  const details = upgraded
    ? await db.rpc("worksync_project_settlement_info", { p_project: projectId })
    : null;
  if (details?.error)
    throw new PaymentError("Milestone payment tracking unavailable.");
  const payout = upgraded
    ? { data: null, error: null }
    : await db
        .from("project_payouts")
        .select("status,paid_at,amount")
        .eq("project_id", projectId)
        .eq("mode", paymentMode())
        .maybeSingle();
  const settlementPayouts = upgraded
    ? (details?.data?.payouts ?? []).filter(
        (r: { mode: string }) => r.mode === paymentMode(),
      )
    : payout.data
      ? [payout.data]
      : [];
  return {
    status: paid
      ? "paid"
      : row.transaction_reference
        ? "pending"
        : "processing",
    amount: row.amount,
    checkoutAllowed: true,
    paymentId: row.payment_id,
    paymentMethod: row.payment_method,
    vatBreakdown,
    payout: payout.error ? { status: "unavailable" } : payout.data,
    settlementVersion,
    finalMilestoneId: details?.data?.finalMilestoneId ?? null,
    payouts: upgraded ? settlementPayouts : undefined,
    refunds: upgraded
      ? (details?.data?.refunds ?? []).filter(
          (r: { mode: string }) => r.mode === paymentMode(),
        )
      : undefined,
    autoReleaseEnabled:
      process.env.PROJECT_SETTLEMENT_ENABLED === "true" &&
      upgraded &&
      !payout.error,
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
  const { project, isClient, freelancerUserId } = await projectForUser(
    db,
    projectId,
    userId,
  );
  if (!isClient)
    throw new PaymentError("Only the project client can pay.", 403);
  await requireEligibleFreelancerSeller(db, freelancerUserId);
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
  const baseAmount = centavos(contract.final_price);
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
    const savedBase =
      existing.freelancer_service_vat_taxable_base == null
        ? baseAmount
        : centavos(Number(existing.freelancer_service_vat_taxable_base));
    const savedVat =
      existing.freelancer_service_vat_taxable_base == null
        ? 0
        : centavos(Number(existing.freelancer_service_vat_amount ?? 0));
    if (
      savedBase !== baseAmount ||
      centavos(existing.amount) !== savedBase + savedVat
    )
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
  const vat = await getProjectVatBreakdown(
    db,
    freelancerUserId,
    contract.final_price,
  );
  if (vat.status === "review_required")
    throw new PaymentError(
      vat.reviewNotice ??
        "The freelancer's required Form 2303 seller verification must be approved before checkout.",
      409,
    );
  if (vat.status !== "applicable" && vat.status !== "not_applicable")
    throw new PaymentError(
      "The freelancer's VAT treatment could not be verified. Contact support before checkout.",
      409,
    );
  const amount = centavos(vat.total ?? contract.final_price);
  // The primary key is a durable, cross-process reservation for one full-project payment per mode.
  const { error: insertError } = await db.from("payments").insert({
    payment_id: id,
    project_id: projectId,
    order_id: project.order_id,
    payer_id: userId,
    amount: amount / 100,
    status: "pending",
    payment_method: "paymongo",
    provider: "paymongo",
    livemode: paymentMode() === "live",
    currency: "PHP",
    freelancer_service_vat_taxable_base: vat.taxableAmount,
    freelancer_service_vat_rate: vat.rate,
    freelancer_service_vat_amount: vat.amount,
    freelancer_service_vat_classification: vat.classification,
    freelancer_service_vat_document_id: vat.documentId,
    freelancer_service_vat_rule:
      vat.classification === "default_vat"
        ? "Default 12% freelancer service VAT added to base price; verified Form 2303, VAT classification needs administrator review"
        : vat.status === "applicable"
          ? "12% freelancer service VAT added to base price; current verified VAT registration and Form 2303"
          : "No freelancer service VAT; administrator-reviewed non-VAT classification and current verified COR",
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
  let session: CheckoutSession;
  try {
    session = await paymongo("/v2/checkout_sessions", {
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
  } catch (error) {
    // A definitive provider rejection created no session, so release the
    // reservation. Keep it when the request outcome is ambiguous to prevent a
    // retry from creating a second payable session.
    if (error instanceof PaymentError && !error.ambiguous) {
      const { error: releaseError } = await db
        .from("payments")
        .delete()
        .eq("payment_id", id)
        .eq("status", "pending")
        .is("transaction_reference", null);
      if (releaseError)
        console.error("Could not release rejected checkout reservation", {
          kind: "checkout_reservation_cleanup_failed",
        });
    }
    throw error;
  }
  const { error: saveError } = await db
    .from("payments")
    .update({ transaction_reference: session.id })
    .eq("payment_id", id)
    .is("transaction_reference", null);
  if (saveError)
    throw new PaymentError(
      "Checkout was created but could not be saved. Contact support before retrying.",
    );
  return { checkoutUrl: checkoutUrl(session) };
}
export async function processPaymentWebhook(sessionId: string) {
  const db = paymentDatabase();
  // Retrieve independently; signed webhook bodies are not used as payment evidence.
  const session = await paymongo(
    `/v1/checkout_sessions/${encodeURIComponent(sessionId)}`,
  );
  if (await processSubscriptionPaymentSession(db, session, true)) return;
  await storageReady(db);
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
