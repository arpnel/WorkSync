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
    const mode = paymentMode();
    const quoteResult = await db.rpc("worksync_payout_withdrawal_quote", {
      p_user: user.id,
      p_mode: mode,
    });
    if (quoteResult.error) throw new PaymentError("Withdrawal balance is not available yet.");
    const quote = Array.isArray(quoteResult.data) ? quoteResult.data[0] : quoteResult.data;
    const withdrawalsResult = await db
      .from("payout_withdrawal_requests")
      .select("withdrawal_id,requested_net_amount,gross_amount,withholding_amount,withholding_rate,withholding_exemption_status,status,requested_at,paid_at")
      .eq("recipient_id", user.id)
      .eq("mode", mode)
      .order("requested_at", { ascending: false })
      .limit(50);
    if (withdrawalsResult.error) throw new PaymentError("Withdrawal history is not available yet.");
    const withdrawals = withdrawalsResult.data ?? [];

    const rows: {
      payout_id: string; payment_id: string; project_id: string; amount: number; gross_amount?: number;
      provider_transfer_id?: string | null; provider_batch_id?: string | null;
      freelancer_vat_taxable_amount?: number; freelancer_vat_amount?: number; freelancer_vat_rate?: number;
      freelancer_vat_rule?: string; withholding_basis?: number; withholding_rate?: number; withholding_amount?: number; withholding_date?: string | null;
      withholding_rule?: string;
      withholding_exemption_status?: string; withholding_declaration_id?: string | null; withholding_document_id?: string | null; freelancer_vat_document_id?: string | null; withdrawal_requested_at?: string | null; status: string; created_at: string; paid_at: string | null;
    }[] = [];
    for (let from = 0; ; from += 500) {
      const result = await db
        .from("project_payouts")
        .select("payout_id,payment_id,project_id,gross_amount,amount,provider_transfer_id,provider_batch_id,freelancer_vat_taxable_amount,freelancer_vat_amount,freelancer_vat_rate,freelancer_vat_rule,withholding_basis,withholding_rate,withholding_amount,withholding_date,withholding_rule,withholding_exemption_status,withholding_declaration_id,withholding_document_id,freelancer_vat_document_id,withdrawal_requested_at,status,created_at,paid_at")
        .eq("recipient_id", user.id)
        .eq("mode", mode)
        .order("created_at", { ascending: false })
        .range(from, from + 499);
      if (result.error) throw new PaymentError("Earnings are not available yet.");
      rows.push(...(result.data ?? []));
      if ((result.data ?? []).length < 500) break;
    }
    const projectIds = [...new Set(rows.map((row) => row.project_id))];
    const projectTitles = new Map<string, string>();
    if (projectIds.length) {
      const projects = await db
        .from("projects")
        .select("project_id,title")
        .in("project_id", projectIds);
      if (projects.error)
        throw new PaymentError("Project earnings are not available yet.");
      for (const project of projects.data ?? [])
        projectTitles.set(project.project_id, project.title);
    }
    const taxableEarnings = (row: (typeof rows)[number]) => Math.max(0, Number(
      row.freelancer_vat_taxable_amount ??
      (row.gross_amount == null ? row.amount ?? 0 : Number(row.gross_amount) - Number(row.freelancer_vat_amount ?? 0)),
    ));
    const netEarnings = (row: (typeof rows)[number]) => Math.max(
      0,
      taxableEarnings(row) - Number(row.withholding_amount ?? 0),
    );
    const amountFor = (statuses: string[]) =>
      rows
        .filter((row) => statuses.includes(row.status))
        .reduce((sum, row) => sum + netEarnings(row), 0);
    const earningsAmountFor = (statuses: string[]) => rows
      .filter((row) => statuses.includes(row.status))
      .reduce((sum, row) => sum + taxableEarnings(row), 0);
    return json({
      eligible: true,
      available: true,
      mode,
      settlementEnabled: process.env.PROJECT_SETTLEMENT_ENABLED === "true",
      summary: {
        withholding: rows.filter((row) => row.status !== "cancelled").reduce((sum, row) => sum + Number(row.withholding_amount ?? 0), 0)
          + withdrawals.reduce((sum, row) => sum + Number(row.withholding_amount ?? 0), 0),
        earned: earningsAmountFor([
          "awaiting_account", "ready", "processing", "pending", "paid", "failed", "needs_review",
        ]),
        // Keep Ready at the full taxable earnings balance. Withholding is
        // accounted for only when the freelancer requests a withdrawal.
        ready: Number(quote?.available_gross ?? 0),
        processing: amountFor(["processing", "pending"])
          + withdrawals.filter((row) => row.status === "processing").reduce((sum, row) => sum + Number(row.requested_net_amount ?? 0), 0),
        paid: amountFor(["paid"])
          + withdrawals.filter((row) => row.status === "paid").reduce((sum, row) => sum + Number(row.requested_net_amount ?? 0), 0),
        awaitingAccount: amountFor(["awaiting_account"]),
        supportReview: amountFor(["failed", "needs_review"]),
      },
      withdrawalQuote: {
        availableGross: Number(quote?.available_gross ?? 0),
        availableNet: Number(quote?.available_net ?? 0),
        withholdingRate: Number(quote?.withholding_rate ?? 0),
        withholdingAmount: Number(quote?.available_withholding ?? 0),
        exemptionStatus: quote?.exemption_status ?? "not_calculated",
      },
      withdrawals: withdrawals.map((row) => ({
        id: row.withdrawal_id,
        requestedNetAmount: Number(row.requested_net_amount),
        grossAmount: Number(row.gross_amount),
        withholdingAmount: Number(row.withholding_amount),
        withholdingRate: Number(row.withholding_rate),
        exemptionStatus: row.withholding_exemption_status,
        status: row.status,
        requestedAt: row.requested_at,
        paidAt: row.paid_at,
      })),
      payouts: rows.map((row) => ({
        id: row.payout_id,
        transactionId: row.payment_id,
        projectId: row.project_id,
        projectTitle: projectTitles.get(row.project_id) ?? "Completed project",
        amount: netEarnings(row),
        grossAmount: taxableEarnings(row),
        transferReference: row.provider_transfer_id ?? null,
        demoTransfer: !row.provider_transfer_id && !row.provider_batch_id,
        freelancerVatTaxableAmount: taxableEarnings(row),
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
    const body = await request.json().catch(() => null) as { grossAmount?: unknown } | null;
    const grossAmount = typeof body?.grossAmount === "number" ? body.grossAmount : Number.NaN;
    if (!Number.isFinite(grossAmount) || grossAmount <= 0 || Math.round(grossAmount * 100) !== grossAmount * 100)
      throw new PaymentError("Enter a gross withdrawal amount with up to two decimal places.", 400);

    const db = paymentDatabase();
    const role = await db.from("freelancer_profiles").select("freelancer_id").eq("user_id", user.id).maybeSingle();
    if (role.error) throw new PaymentError("Unable to check account role.");
    if (!role.data) throw new PaymentError("A freelancer account is required.", 403);
    const result = await db.rpc("worksync_request_partial_withdrawal", {
      p_user: user.id,
      p_gross_amount: grossAmount,
      p_mode: paymentMode(),
    });
    if (result.error) {
      const message = result.error.message ?? "";
      const normalizedMessage = message.toLowerCase();
      if (/bir|2303|canonical.*cor|cor.*verified/.test(normalizedMessage))
        throw new PaymentError("A current BIR Form 2303 must be submitted and verified before you can withdraw.", 409);
      if (normalizedMessage.includes("payout account"))
        throw new PaymentError("Add a payout account before requesting withdrawal.", 409);
      if (normalizedMessage.includes("seller document"))
        throw new PaymentError("Submit the required seller documents and wait for approval before requesting withdrawal.", 409);
      if (normalizedMessage.includes("freelancer account"))
        throw new PaymentError("A freelancer account is required.", 403);
      if (message.includes("Payout was not found"))
        throw new PaymentError("Payout was not found.", 404);
      if (normalizedMessage.includes("exceeds available earnings"))
        throw new PaymentError("That gross withdrawal exceeds your available earnings. Lower the amount and try again.", 409);
      if (normalizedMessage.includes("only a ready payout") || normalizedMessage.includes("no longer available"))
        throw new PaymentError("This payout is no longer available to request.", 409);
      throw new PaymentError("Check that your payout account, BIR Form 2303, and required seller documents are current and verified. If they are, try again shortly.", 409);
    }
    const withdrawal = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!withdrawal?.withdrawal_id || !withdrawal.requested_at || withdrawal.status !== "processing")
      throw new PaymentError("Withdrawal request could not be confirmed. Refresh the page and check its status.");
    return json({ requested: true, status: withdrawal.status, withdrawalId: withdrawal.withdrawal_id, requestedAt: withdrawal.requested_at });
  } catch (error) {
    return paymentResponse(error);
  }
}

