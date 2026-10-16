import { z } from "zod";
import { reviewProjectPayment } from "@/services/payments/settlementServer";
import { paymentUser, paymentResponse } from "@/services/payments/paymentServer";
import { PaymentError } from "@/lib/payments/paymongo";

export const runtime = "nodejs";

const input = z
  .object({
    projectId: z.string().uuid(),
    submissionId: z.string().uuid(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new PaymentError("Invalid project review.", 400);
    const { projectId, submissionId } = parsed.data;

    const [projectResult, submissionResult] = await Promise.all([
      db
        .from("projects")
        .select("project_id, client_id")
        .eq("project_id", projectId)
        .maybeSingle(),
      db
        .from("project_submissions")
        .select("submission_id")
        .eq("submission_id", submissionId)
        .eq("project_id", projectId)
        .eq("kind", "delivery")
        .eq("status", "approved")
        .maybeSingle(),
    ]);
    if (projectResult.error || !projectResult.data)
      throw new PaymentError("Project unavailable.", 404);
    if (submissionResult.error || !submissionResult.data)
      throw new PaymentError("Approved delivery unavailable.", 409);

    const client = await db
      .from("client_profiles")
      .select("user_id")
      .eq("client_id", projectResult.data.client_id)
      .maybeSingle();
    if (client.error || client.data?.user_id !== user.id)
      throw new PaymentError(
        "Only the project client can request settlement review.",
        403,
      );

    const settlementReviewStatus = await reviewProjectPayment(projectId);
    return Response.json(
      { settlementReviewStatus },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return paymentResponse(error);
  }
}