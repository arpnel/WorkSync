import "server-only";
import { createCipheriv, randomBytes } from "node:crypto";
import { PaymentError } from "@/lib/payments/paymongo";

function encryptionKey() {
  const value = process.env.TAX_IDENTIFIER_ENCRYPTION_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value)) {
    throw new PaymentError("Secure TIN storage is not configured.");
  }
  return Buffer.from(value, "hex");
}

export function normalizeTin(value: unknown) {
  if (typeof value !== "string") throw new PaymentError("Enter a valid TIN.", 400);
  const input = value.trim();
  if (!/^[\d\s-]+$/.test(input)) throw new PaymentError("Enter a valid TIN.", 400);
  const tin = input.replace(/[\s-]/g, "");
  if (!/^\d{9,12}$/.test(tin)) throw new PaymentError("Enter 9 to 12 digits for your TIN.", 400);
  return tin;
}

export function encryptTin(tin: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(tin, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}
