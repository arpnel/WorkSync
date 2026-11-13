import "server-only";
import { createHmac } from "node:crypto";

export function identityNumberFingerprint(value: string) {
  const normalized = value.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length < 3 || normalized.length > 64)
    throw new Error("Enter a valid ID number or leave it blank.");
  const secret = process.env.IDENTITY_FINGERPRINT_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Duplicate ID checks are not configured yet.");
  return createHmac("sha256", secret).update(normalized, "utf8").digest("hex");
}
