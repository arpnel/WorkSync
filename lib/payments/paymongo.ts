import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export class PaymentError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
export function paymentMode() {
  const key = process.env.PAYMONGO_SECRET_KEY?.trim();
  if (!key || !/^sk_(test|live)_/.test(key))
    throw new PaymentError("Set PAYMONGO_SECRET_KEY on the server.");
  return key.startsWith("sk_live_") ? "live" : "test";
}
export function paymentId(projectId: string, mode = paymentMode()) {
  const hex = createHash("sha256")
    .update(`worksync:paymongo:${mode}:${projectId.toLowerCase()}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function centavos(value: unknown) {
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  if (
    !Number.isFinite(amount) ||
    !Number.isSafeInteger(cents) ||
    cents < 2000 ||
    Math.abs(amount * 100 - cents) > 0.00001
  )
    throw new PaymentError(
      "The agreed amount must be at least PHP 20 and have at most two decimal places.",
      409,
    );
  return cents;
}
export interface CheckoutSession {
  id: string;
  attributes: {
    checkout_url?: string;
    livemode: boolean;
    status?: string;
    reference_number: string;
    metadata?: Record<string, string>;
    payments?: {
      id: string;
      attributes: {
        amount: number;
        currency: string;
        status: string;
        paid_at?: number | null;
        livemode?: boolean;
        source?: { type: string };
      };
    }[];
  };
}
export async function paymongo(
  path: string,
  attributes?: Record<string, unknown>,
): Promise<CheckoutSession> {
  paymentMode();
  let response: Response;
  try {
    response = await fetch(`https://api.paymongo.com${path}`, {
      method: attributes ? "POST" : "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.PAYMONGO_SECRET_KEY!.trim()}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: attributes ? JSON.stringify({ data: { attributes } }) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new PaymentError(
      "PayMongo could not confirm the request. Check payment status before retrying.",
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.data?.id) {
    // Never expose provider payloads, credentials, or customer billing data.
    throw new PaymentError(
      response.status === 401
        ? "PayMongo rejected the server API key."
        : "PayMongo could not complete this request. Check the merchant configuration and payment status.",
    );
  }
  return body.data;
}
export function checkoutUrl(session: CheckoutSession) {
  const url = new URL(
    session.attributes.checkout_url ?? "https://invalid.local",
  );
  if (url.protocol !== "https:" || url.hostname !== "checkout.paymongo.com")
    throw new PaymentError("PayMongo returned an invalid checkout URL.");
  return url.toString();
}
export function verifyWebhook(
  raw: string,
  header: string | null,
  now = Date.now(),
) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret)
    throw new PaymentError(
      "PayMongo webhook signing secret is not configured.",
    );
  const parts = Object.fromEntries(
    (header ?? "").split(",").map((part) => part.trim().split("=")),
  );
  const timestamp = parts.t;
  const signature = parts[paymentMode() === "live" ? "li" : "te"];
  if (
    !/^\d+$/.test(timestamp ?? "") ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    !/^[a-f\d]{64}$/i.test(signature ?? "")
  )
    throw new PaymentError("Invalid webhook signature.", 401);
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
    throw new PaymentError("Invalid webhook signature.", 401);
}
