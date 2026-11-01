import { PaymentError, paymentMode } from "@/lib/payments/paymongo";
import {
  paymentUser,
  paymentDatabase,
  paymentResponse,
} from "@/services/payments/paymentServer";

export const runtime = "nodejs";
const json = (data: unknown) =>
  Response.json(data, { headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  try {
    const { user } = await paymentUser(request);
    const db = paymentDatabase();
    const role = await db
      .from("freelancer_profiles")
      .select("freelancer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (role.error) throw new PaymentError("Unable to check account role.");
    if (!role.data) return json({ eligible: false });

    const version = await db.rpc("worksync_settlement_version");
    if (version.error || version.data !== 3) return json({ eligible: true, available: false, payouts: [] });

    const rows: {
      payout_id: string; payment_id: string; project_id: string; amount: number; gross_amount?: number;
      provider_transfer_id?: string | null;
      freelancer_vat_taxable_amount?: number; freelancer_vat_amount?: number; freelancer_vat_rate?: number;
      freelancer_vat_rule?: string; withholding_basis?: number; withholding_rate?: number; withholding_amount?: number; withholding_date?: string | null;
      withholding_rule?: string;
      withholding_exemption_status?: string; withholding_declaration_id?: string | null; withholding_document_id?: string | null; freelancer_vat_document_id?: string | null; withdrawal_requested_at?: string | null; status: string; created_at: string; paid_at: string | null;
    }[] = [];
    for (let from = 0; ; from += 500) {
      const result = await db
        .from("project_payouts")
        .select("payout_id,payment_id,project_id,gross_amount,amount,provider_transfer_id,freelancer_vat_taxable_amount,freelancer_vat_amount,freelancer_vat_rate,freelancer_vat_rule,withholding_basis,withholding_rate,withholding_amount,withholding_date,withholding_rule,withholding_exemption_status,withholding_declaration_id,withholding_document_id,freelancer_vat_document_id,withdrawal_requested_at,status,created_at,paid_at")
        .eq("recipient_id", user.id)
        .eq("mode", paymentMode())
        .order("created_at", { ascending: false })
        .range(from, from + 499);
      if (result.error) throw new PaymentError("Earnings are not available yet.");
      rows.push(...(result.data ?? []));
      if ((result.data ?? []).length < 500) break;
    }
    const amountFor = (statuses: string[]) =>
      rows
        .filter((row) => statuses.includes(row.status))
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const grossAmountFor = (statuses: string[]) => rows.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + Number(row.gross_amount ?? row.amount ?? 0), 0);
    return json({
      eligible: true,
      available: true,
      mode: paymentMode(),
      settlementEnabled: process.env.PROJECT_SETTLEMENT_ENABLED === "true",
      summary: {
        withholding: rows.filter((row) => row.status !== "cancelled").reduce((sum, row) => sum + Number(row.withholding_amount ?? 0), 0),
        earned: grossAmountFor([
          "awaiting_account", "ready", "processing", "pending", "paid", "failed", "needs_review",
        ]),
        ready: amountFor(["ready"]),
        processing: amountFor(["processing", "pending"]),
        paid: amountFor(["paid"]),
        awaitingAccount: amountFor(["awaiting_account"]),
        supportReview: amountFor(["failed", "needs_review"]),
      },
      payouts: rows.map((row) => ({
        id: row.payout_id,
        transactionId: row.payment_id,
        projectId: row.project_id,
        amount: Number(row.amount),
        grossAmount: Number(row.gross_amount ?? row.amount),
        transferReference: row.provider_transfer_id ?? null,
        freelancerVatTaxableAmount: Number(row.freelancer_vat_taxable_amount ?? row.gross_amount ?? row.amount),
        freelancerVatAmount: Number(row.freelancer_vat_amount ?? 0),
        freelancerVatRate: Number(row.freelancer_vat_rate ?? 0),
        freelancerVatRule: row.freelancer_vat_rule ?? "not recorded",
        withholdingBasis: Number(row.withholding_basis ?? 0),
        withholdingRate: Number(row.withholding_rate ?? 0),
        withholdingAmount: Number(row.withholding_amount ?? 0),
        withholdingDate: row.withholding_date,
        withholdingRule: row.withholding_rule ?? "not recorded",
        withholdingExemptionStatus: row.withholding_exemption_status ?? "not recorded",
        withholdingDeclarationId: row.withholding_declaration_id ?? null,
        withholdingDocumentId: row.withholding_document_id ?? null,
        freelancerVatDocumentId: row.freelancer_vat_document_id ?? null,
        withdrawalRequestedAt: row.withdrawal_requested_at ?? null,
        status: row.status,
        createdAt: row.created_at,
        paidAt: row.paid_at,
      })),
    });
  } catch (error) {
    return paymentResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await paymentUser(request);
    const body = await request.json().catch(() => null) as { payoutId?: unknown } | null;
    if (typeof body?.payoutId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.payoutId))
      throw new PaymentError("Select a valid payout to request.", 400);

    const db = paymentDatabase();
    const role = await db.from("freelancer_profiles").select("freelancer_id").eq("user_id", user.id).maybeSingle();
    if (role.error) throw new PaymentError("Unable to check account role.");
    if (!role.data) throw new PaymentError("A freelancer account is required.", 403);
    const sellerEligibility = await db.rpc("worksync_freelancer_seller_eligible", { p_user: user.id });
    if (sellerEligibility.error) throw new PaymentError("Seller document eligibility could not be checked. Try again before requesting withdrawal.", 503);
    if (sellerEligibility.data !== true) throw new PaymentError("Submit the required seller documents and wait for approval before requesting withdrawal.", 409);
    const account = await db.from("freelancer_payout_accounts").select("user_id").eq("user_id", user.id).eq("mode", paymentMode()).maybeSingle();
    if (account.error) throw new PaymentError("Unable to verify your payout account.");
    if (!account.data) throw new PaymentError("Add a payout account before requesting withdrawal.", 409);

    const requestedAt = new Date().toISOString();
    const updated = await db.from("project_payouts")
      .update({ withdrawal_requested_at: requestedAt, updated_at: requestedAt })
      .eq("payout_id", body.payoutId)
      .eq("recipient_id", user.id)
      .eq("mode", paymentMode())
      .eq("status", "ready")
      .is("withdrawal_requested_at", null)
      .select("payout_id,withdrawal_requested_at")
      .maybeSingle();
    if (updated.error) throw new PaymentError("Withdrawal request could not be saved.");
    if (updated.data) return json({ requested: true, payoutId: updated.data.payout_id, requestedAt: updated.data.withdrawal_requested_at });

    const current = await db.from("project_payouts")
      .select("payout_id,status,withdrawal_requested_at")
      .eq("payout_id", body.payoutId)
      .eq("recipient_id", user.id)
      .eq("mode", paymentMode())
      .maybeSingle();
    if (current.error) throw new PaymentError("Unable to verify withdrawal request.");
    if (current.data?.status === "ready" && current.data.withdrawal_requested_at)
      return json({ requested: true, payoutId: current.data.payout_id, requestedAt: current.data.withdrawal_requested_at });
    if (!current.data) throw new PaymentError("Payout was not found.", 404);
    throw new PaymentError("This payout is no longer available to request.", 409);
  } catch (error) {
    return paymentResponse(error);
  }
}

