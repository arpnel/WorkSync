import { PaymentError, paymentMode } from "@/lib/payments/paymongo";
import {
  paymentUser,
  paymentResponse,
} from "@/services/payments/paymentServer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const role = await db
      .from("freelancer_profiles")
      .select("freelancer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (role.error) throw new PaymentError("Unable to check account role.");
    if (!role.data) throw new PaymentError("A freelancer account is required.", 403);

    const version = await db.rpc("worksync_settlement_version");
    if (version.error || version.data !== 3)
      throw new PaymentError("Payout tracking is not ready yet. Please try again later.", 503);

    const result = await db.rpc("worksync_backfill_completed_freelancer_payouts", {
      p_freelancer: user.id,
      p_mode: paymentMode(),
      p_limit: 100,
    });
    if (result.error)
      throw new PaymentError("Past earnings could not be synced. Please try again.");
    const counts = Array.isArray(result.data) ? result.data[0] : result.data;
    return Response.json(
      {
        projectsProcessed: Number(counts?.projects_processed ?? 0),
        payoutsCreated: Number(counts?.payouts_created ?? 0),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return paymentResponse(error);
  }
}
