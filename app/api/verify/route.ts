import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";
import { identityNumberFingerprint } from "@/services/verification/identityFingerprint";
import { validateIdentityImage } from "@/services/verification/identityImage";
import { inspectTaxDocument } from "@/lib/tax/taxDocumentUpload";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const bucket = "verification-documents";

function pathFor(userId: string, requestId: string, slot: "front" | "back" | "selfie", path: unknown) {
  if (typeof path !== "string" || !new RegExp(`^${userId}/identity-verification/${requestId}/${slot}\\.(jpg|png)$`).test(path))
    throw new PaymentError("An uploaded identity image is invalid.", 400);
  return path;
}

async function currentRequest(db: Awaited<ReturnType<typeof paymentUser>>["db"], userId: string) {
  const result = await db
    .from("manual_identity_verification_requests")
    .select("request_id,status,rejection_reason,reverification_requested_at,reverification_reason,submitted_at,reviewed_at")
    .eq("user_id", userId)
    .eq("is_current", true)
    .maybeSingle();
  if (result.error) throw new PaymentError("Identity verification is not available yet. The prepared database migration must be applied.", 503);
  return result.data;
}

export async function GET(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const row = await currentRequest(db, user.id);
    const status = row?.status ?? "not_submitted";
    return json({
      status,
      verified: status === "verified",
      canSubmit: status === "not_submitted" || status === "rejected" || Boolean(row?.reverification_requested_at),
      rejectionReason: row?.rejection_reason ?? null,
      reverificationReason: row?.reverification_reason ?? null,
      submittedAt: row?.submitted_at ?? null,
      reviewedAt: row?.reviewed_at ?? null,
    });
  } catch (error) {
    return paymentResponse(error);
  }
}
export async function POST(request: Request) {
  const uploadedPaths: string[] = [];
  try {
    const { db, user } = await paymentUser(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.requestId))
      throw new PaymentError("Submit the uploaded identity images again.", 400);
    const requestId = body.requestId;
    const frontPath = pathFor(user.id, requestId, "front", body.idFrontPath);
    const selfiePath = pathFor(user.id, requestId, "selfie", body.selfiePath);
    const backPath = body.idBackPath == null ? null : pathFor(user.id, requestId, "back", body.idBackPath);
    uploadedPaths.push(frontPath, selfiePath, ...(backPath ? [backPath] : []));
    const current = await currentRequest(db, user.id);
    if (current?.status === "pending" || current?.status === "verified" && !current.reverification_requested_at)
      throw new PaymentError("An existing identity verification must be resolved before another submission.", 409);

    const validateStoredImage = async (path: string) => {
      const { data, error } = await db.storage.from(bucket).download(path);
      if (error || !data) throw new PaymentError("An uploaded image could not be verified in private storage.", 400);
      const format = validateIdentityImage(path, data.type || (path.endsWith(".png") ? "image/png" : "image/jpeg"), data.size);
      try {
        inspectTaxDocument(path, format.contentType, new Uint8Array(await data.arrayBuffer()));
      } catch {
        throw new PaymentError("Choose a readable JPG or PNG image that matches its file extension.", 400);
      }
    };
    await Promise.all([validateStoredImage(frontPath), validateStoredImage(selfiePath), ...(backPath ? [validateStoredImage(backPath)] : [])]);

    let fingerprint: string | null = null;
    if (typeof body.idNumber === "string" && body.idNumber.trim()) {
      try {
        fingerprint = identityNumberFingerprint(body.idNumber);
      } catch {
        throw new PaymentError("Duplicate ID checks are temporarily unavailable. Please try again later.", 503);
      }
    }
    const submitted = await db.rpc("worksync_submit_manual_identity_verification", {
      p_user_id: user.id,
      p_request_id: requestId,
      p_id_front_path: frontPath,
      p_id_back_path: backPath,
      p_selfie_path: selfiePath,
      p_id_fingerprint: fingerprint,
    });
    if (submitted.error) {
      if (submitted.error.code === "23505") throw new PaymentError("A verification request is already pending.", 409);
      throw new PaymentError("Your identity verification could not be submitted. Please try again.", 409);
    }
    return json({ submitted: true });
  } catch (error) {
    if (uploadedPaths.length) await paymentUser(request).then(({ db }) => db.storage.from(bucket).remove(uploadedPaths)).catch(() => undefined);
    return paymentResponse(error);
  }
}
