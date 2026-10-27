import { z } from "zod";
import { getWorkSyncOrigin } from "@/lib/appUrl";
import { PaymentError, paymentMode } from "@/lib/payments/paymongo";
import {
  paymentUser,
  paymentResponse,
} from "@/services/payments/paymentServer";
import {
  createSubscriptionCheckout,
  getSubscriptionCheckoutStatus,
} from "@/services/subscriptions/subscriptionServer";
export const runtime = "nodejs";
const input = z.object({ orderId: z.string().uuid() }).strict();
const json = (value: unknown) =>
  Response.json(value, { headers: { "Cache-Control": "no-store" } });

function checkoutOrigin(request: Request) {
  const url = new URL(getWorkSyncOrigin(request.url));
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (paymentMode() === "live" && (url.protocol !== "https:" || local))
  )
    throw new PaymentError(
      "Set APP_URL to your public HTTPS application URL before enabling payments.",
    );
  if (paymentMode() === "live" && !process.env.PAYMONGO_WEBHOOK_SECRET)
    throw new PaymentError(
      "Configure the PayMongo webhook before accepting live payments.",
    );
  return url.origin;
}

export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    return json(
      await createSubscriptionCheckout(db, user.id, checkoutOrigin(request)),
    );
  } catch (error) {
    return paymentResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const parsed = input.safeParse({
      orderId: new URL(request.url).searchParams.get("orderId"),
    });
    if (!parsed.success) throw new PaymentError("Invalid Premium checkout.", 400);
    return json(
      await getSubscriptionCheckoutStatus(db, user.id, parsed.data.orderId),
    );
  } catch (error) {
    return paymentResponse(error);
  }
}
