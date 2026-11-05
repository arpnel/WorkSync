import { z } from "zod";
import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";
import { getAdminDiditIdentity } from "@/services/verification/verificationServer";
import { VerificationError } from "@/lib/verification/didit";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const { requestId } = await context.params;
    if (!z.string().uuid().safeParse(requestId).success)
      return json({ error: "Invalid verification request." }, 400);

    const { db, user } = await paymentUser(request);
    const admin = await db
      .from("admin_members")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (admin.error)
      throw new PaymentError("Unable to verify administrator access.");
    if (!admin.data)
      throw new PaymentError("Administrator access required.", 403);

    const { data: verification, error } = await db
      .from("verification_requests")
      .select("user_id")
      .eq("request_id", requestId)
      .maybeSingle();
    if (error)
      throw new PaymentError("Verification details could not be loaded.");
    if (!verification)
      throw new PaymentError("Verification request not found.", 404);

    const identity = await getAdminDiditIdentity(
      requestId,
      verification.user_id,
    );
    return json({ identity, simulated: identity?.environment === "sandbox" });
  } catch (error) {
    if (error instanceof VerificationError)
      return json({ error: error.message }, error.status);
    return paymentResponse(error);
  }
}
