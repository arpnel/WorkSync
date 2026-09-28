import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { PaymentError, paymentMode } from "./paymongo";

export const destinationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    number: z
      .string()
      .trim()
      .regex(/^\d{6,34}$/),
    bic: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{8}([A-Z0-9]{3})?$/),
    provider: z.enum(["instapay", "pesonet"]),
    bankLabel: z.string().trim().min(2).max(100),
  })
  .strict();
export type PayoutDestination = z.infer<typeof destinationSchema>;
function encryptionKey() {
  const value = process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value))
    throw new PaymentError("Payout account storage is not configured.");
  return Buffer.from(value, "hex");
}
export function encryptDestination(value: PayoutDestination) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), data]
    .map((part) => part.toString("base64url"))
    .join(".");
}
export function decryptDestination(value: string): PayoutDestination {
  const [iv, tag, data] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return destinationSchema.parse(
    JSON.parse(
      Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8"),
    ),
  );
}
export async function transferRequest(
  path: string,
  payload?: unknown,
  idempotencyKey?: string,
) {
  paymentMode();
  const response = await fetch(`https://api.paymongo.com${path}`, {
    method: payload ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY!.trim() + ":").toString("base64")}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new PaymentError(
      "Transfer service could not complete the request. Contact support.",
    );
  return response.json();
}
export function payoutSource() {
  const number = process.env.PAYMONGO_PAYOUT_SOURCE_NUMBER;
  const name = process.env.PAYMONGO_PAYOUT_SOURCE_NAME;
  if (!number || !name)
    throw new PaymentError("The payout wallet is not configured.");
  return { number, name, bic: "PAEYPHM2XXX" };
}
export interface ProviderTransfer {
  id: string;
  status: string;
  amount: number;
  currency: string;
  reference_number: string;
  destination_account: { name: string; number: string; bic: string };
}
export function verifiedTransferStatus(
  transfer: ProviderTransfer,
  id: string,
  amount: number,
  destination: PayoutDestination,
) {
  if (
    !transfer?.id ||
    transfer.reference_number !== id ||
    transfer.amount !== Math.round(amount * 100) ||
    transfer.currency !== "PHP" ||
    transfer.destination_account?.number !== destination.number ||
    transfer.destination_account?.bic !== destination.bic ||
    transfer.destination_account?.name !== destination.name
  )
    throw new PaymentError("Transfer reconciliation mismatch.");
  if (transfer.status === "succeeded") return "paid";
  if (["failed", "cancelled", "reversed"].includes(transfer.status))
    return "failed";
  return "pending";
}
