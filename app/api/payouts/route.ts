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
    if (version.error || version.data !== 2) return json({ eligible: true, available: false, payouts: [] });

    const rows: {
      payout_id: string; payment_id: string; project_id: string; amount: number; gross_amount?: number;
      freelancer_vat_taxable_amount?: number; freelancer_vat_amount?: number; freelancer_vat_rate?: number;
      freelancer_vat_rule?: string; withholding_basis?: number; withholding_rate?: number; withholding_amount?: number; withholding_date?: string | null;
      withholding_rule?: string;
      withholding_exemption_status?: string; withholding_declaration_id?: string | null; withholding_document_id?: string | null; freelancer_vat_document_id?: string | null; status: string; created_at: string; paid_at: string | null;
    }[] = [];
    for (let from = 0; ; from += 500) {
      const result = await db
        .from("project_payouts")
        .select("payout_id,payment_id,project_id,gross_amount,amount,freelancer_vat_taxable_amount,freelancer_vat_amount,freelancer_vat_rate,freelancer_vat_rule,withholding_basis,withholding_rate,withholding_amount,withholding_date,withholding_rule,withholding_exemption_status,withholding_declaration_id,withholding_document_id,freelancer_vat_document_id,status,created_at,paid_at")
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
        status: row.status,
        createdAt: row.created_at,
        paidAt: row.paid_at,
      })),
    });
  } catch (error) {
    return paymentResponse(error);
  }
}

