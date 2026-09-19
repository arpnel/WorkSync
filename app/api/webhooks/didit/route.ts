import {
  VerificationError,
  verifyDiditWebhook,
} from "@/lib/verification/didit";
import {
  applyVerificationEvent,
  eventSchema,
  verificationResponse,
} from "@/services/verification/verificationServer";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 1000000)
      throw new VerificationError("Webhook is too large.", 413);
    const body = verifyDiditWebhook(
      raw,
      request.headers.get("x-signature-v2"),
      request.headers.get("x-timestamp"),
    );
    if (request.headers.get("x-didit-test-webhook") === "true")
      return Response.json({ received: true });
    if (!body || typeof body !== "object" || !("webhook_type" in body))
      throw new VerificationError("Invalid webhook.", 400);
    if (body.webhook_type !== "status.updated")
      return Response.json({ received: true });
    const event = eventSchema.safeParse(body);
    if (!event.success)
      throw new VerificationError("Invalid verification event.", 400);
    await applyVerificationEvent(event.data);
    return Response.json({ received: true });
  } catch (error) {
    return verificationResponse(error);
  }
}
