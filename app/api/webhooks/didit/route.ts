import {
  VerificationError,
  getDiditEnvironment,
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
      Date.now(),
      request.headers.get("x-signature-v2-previous"),
    );
    if (!body || typeof body !== "object" || !("webhook_type" in body))
      throw new VerificationError("Invalid webhook.", 400);
    if (!("environment" in body) || body.environment !== getDiditEnvironment())
      throw new VerificationError(
        "Verification event environment does not match this application.",
        409,
      );
    if (request.headers.get("x-didit-test-webhook") === "true")
      return Response.json({ received: true });
    if (body.webhook_type !== "status.updated")
      return Response.json({ received: true });
    const event = eventSchema.safeParse(body);
    if (!event.success)
      throw new VerificationError("Invalid verification event.", 400);
    await applyVerificationEvent(event.data);
    return Response.json({ received: true });
  } catch (error) {
    console.warn("Didit webhook processing failed", {
      status: error instanceof VerificationError ? error.status : 503,
      reason:
        error instanceof VerificationError
          ? error.message
          : "Unexpected verification processing failure",
    });
    return verificationResponse(error);
  }
}
