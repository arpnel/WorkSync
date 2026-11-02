import { PaymentError, paymentMode } from "@/lib/payments/paymongo";
import {
  paymentUser,
  paymentDatabase,
  paymentResponse,
} from "@/services/payments/paymentServer";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  try {
    const { user } = await paymentUser(request);
    const body = (await request.json().catch(() => null)) as { withdrawalId?: unknown } | null;
    if (
      typeof body?.withdrawalId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.withdrawalId)
    ) throw new PaymentError("Select a valid withdrawal to complete.", 400);

    const db = paymentDatabase();
    const role = await db
      .from("freelancer_profiles")
      .select("freelancer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (role.error) throw new PaymentError("Unable to check account role.");
    if (!role.data) throw new PaymentError("A freelancer account is required.", 403);

    const result = await db.rpc("worksync_complete_demo_payout", {
      p_user: user.id,
      p_withdrawal_id: body.withdrawalId,
      p_mode: paymentMode(),
    });
    if (result.error) {
      const message = result.error.message ?? "";
      if (message.includes("Withdrawal was not found"))
        throw new PaymentError("Withdrawal was not found.", 404);
      if (message.includes("not processing"))
        throw new PaymentError("This payout is not ready to complete.", 409);
      throw new PaymentError("Demo payout could not be completed.");
    }
    const withdrawal = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!withdrawal?.withdrawal_id || withdrawal.status !== "paid" || !withdrawal.paid_at)
      throw new PaymentError("Demo payout completion could not be confirmed.");
    return json({ completed: true, withdrawalId: withdrawal.withdrawal_id, paidAt: withdrawal.paid_at });
  } catch (error) {
    return paymentResponse(error);
  }
}
