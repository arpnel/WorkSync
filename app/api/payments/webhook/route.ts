import { PaymentError, verifyWebhook } from "@/lib/payments/paymongo";
import {
  paymentResponse,
  processPaymentWebhook,
} from "@/services/payments/paymentServer";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 1000000)
      throw new PaymentError("Webhook payload is too large.", 413);
    verifyWebhook(raw, request.headers.get("paymongo-signature"));
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new PaymentError("Invalid webhook JSON.", 400);
    }
    // Accept PayMongo's legacy event envelope and its current hosted-checkout envelope.
    const event = body?.data?.attributes ?? body?.data;
    if (event?.type === "checkout_session.payment.paid") {
      const sessionId = event.data?.id;
      if (typeof sessionId !== "string" || !/^cs_[a-zA-Z0-9]+$/.test(sessionId))
        throw new PaymentError("Invalid checkout session.", 400);
      await processPaymentWebhook(sessionId);
    }
    return Response.json({ received: true });
  } catch (error) {
    return paymentResponse(error);
  }
}
