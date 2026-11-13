import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";
import { validateIdentityImage } from "@/services/verification/identityImage";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!Array.isArray(body?.files) || body.files.length < 2 || body.files.length > 3)
      throw new PaymentError("Choose the front of your ID, your selfie, and the back when applicable.", 400);
    const files = body.files as Array<Record<string, unknown>>;
    const slots = files.map((file) => file.slot);
    if (!slots.includes("front") || !slots.includes("selfie") || slots.some((slot) => !["front", "back", "selfie"].includes(String(slot))) || new Set(slots).size !== slots.length)
      throw new PaymentError("Choose the front of your ID, your selfie, and the back when applicable.", 400);
    for (const file of files) {
      if (typeof file.fileName !== "string" || typeof file.contentType !== "string" || typeof file.size !== "number")
        throw new PaymentError("The selected image details are invalid.", 400);
      try { validateIdentityImage(file.fileName, file.contentType, file.size); }
      catch (cause) { throw new PaymentError(cause instanceof Error ? cause.message : "Choose a JPG or PNG image up to 5 MB.", 400); }
    }
    const current = await db
      .from("manual_identity_verification_requests")
      .select("status,reverification_requested_at")
      .eq("user_id", user.id)
      .eq("is_current", true)
      .maybeSingle();
    if (current.error)
      throw new PaymentError("Identity verification is not available yet. The prepared database migration must be applied.", 503);
    if (current.data?.status === "pending" || current.data?.status === "verified" && !current.data.reverification_requested_at)
      throw new PaymentError("An existing identity verification must be resolved before another submission.", 409);

    const requestId = crypto.randomUUID();
    const uploads = await Promise.all(files.map(async (file) => {
      const slot = file.slot as "front" | "back" | "selfie";
      const format = validateIdentityImage(file.fileName as string, file.contentType as string, file.size as number);
      const path = `${user.id}/identity-verification/${requestId}/${slot}.${format.extension}`;
      const result = await db.storage.from("verification-documents").createSignedUploadUrl(path, { upsert: false });
      if (result.error || !result.data?.token)
        throw new PaymentError("A secure image upload could not be prepared.", 503);
      return { slot, path, token: result.data.token, contentType: format.contentType };
    }));
    return json({ requestId, uploads });
  } catch (error) {
    return paymentResponse(error);
  }
}
