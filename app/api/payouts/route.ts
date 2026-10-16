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
    if (version.error || version.data !== 2)
      return json({ eligible: true, available: false, payouts: [] });

    const rows: {
      payout_id: string;
      project_id: string;
      amount: number;
      status: string;
      created_at: string;
      paid_at: string | null;
    }[] = [];
    for (let from = 0; ; from += 500) {
      const result = await db
        .from("project_payouts")
        .select("payout_id,project_id,amount,status,created_at,paid_at")
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
    return json({
      eligible: true,
      available: true,
      mode: paymentMode(),
      settlementEnabled: process.env.PROJECT_SETTLEMENT_ENABLED === "true",
      summary: {
        earned: amountFor([
          "awaiting_account", "ready", "processing", "pending", "paid", "failed", "needs_review",
        ]),
        ready: amountFor(["ready"]),
        processing: amountFor(["processing", "pending"]),
        paid: amountFor(["paid"]),
        awaitingAccount: amountFor(["awaiting_account"]),
        supportReview: amountFor(["failed", "needs_review"]),
      },
      payouts: rows.slice(0, 5).map((row) => ({
        id: row.payout_id,
        projectId: row.project_id,
        amount: Number(row.amount),
        status: row.status,
        createdAt: row.created_at,
        paidAt: row.paid_at,
      })),
    });
  } catch (error) {
    return paymentResponse(error);
  }
}

