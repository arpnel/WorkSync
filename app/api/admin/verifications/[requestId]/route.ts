import { z } from "zod";
import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function requireAdmin(request: Request) {
  const auth = await paymentUser(request);
  const member = await auth.db.from("admin_members").select("user_id").eq("user_id", auth.user.id).maybeSingle();
  if (member.error || !member.data) throw new PaymentError("Administrator access required.", 403);
  return auth;
}

export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await context.params;
    if (!z.string().uuid().safeParse(requestId).success) return json({ error: "Invalid verification request." }, 400);
    const { db } = await requireAdmin(request);
    const result = await db.from("manual_identity_verification_requests")
      .select("request_id,user_id,id_front_path,id_back_path,selfie_path,id_fingerprint,status,rejection_reason,submitted_at,reviewed_at,reviewed_by,reverification_requested_at,reverification_reason")
      .eq("request_id", requestId).maybeSingle();
    if (result.error) throw new PaymentError("Identity evidence could not be loaded. The prepared database migration must be applied.", 503);
    if (!result.data) throw new PaymentError("Verification request not found.", 404);
    const row = result.data;
    const [profile, signedFront, signedBack, signedSelfie, history, duplicateRows] = await Promise.all([
      db.from("profiles").select("user_id,first_name,last_name,display_name,email").eq("user_id", row.user_id).maybeSingle(),
      db.storage.from("verification-documents").createSignedUrl(row.id_front_path, 300),
      row.id_back_path ? db.storage.from("verification-documents").createSignedUrl(row.id_back_path, 300) : Promise.resolve({ data: null, error: null }),
      db.storage.from("verification-documents").createSignedUrl(row.selfie_path, 300),
      db.from("manual_identity_verification_requests").select("request_id,status,rejection_reason,submitted_at,reviewed_at,reviewed_by").eq("user_id", row.user_id).order("submitted_at", { ascending: false }).limit(20),
      row.id_fingerprint ? db.from("manual_identity_verification_requests").select("request_id,user_id").eq("id_fingerprint", row.id_fingerprint).neq("user_id", row.user_id) : Promise.resolve({ data: [], error: null }),
    ]);
    if (profile.error || history.error || duplicateRows.error || signedFront.error || signedSelfie.error || signedBack.error)
      throw new PaymentError("Identity review details or private evidence are unavailable.", 503);
    const duplicateIds = [...new Set((duplicateRows.data ?? []).map((item) => item.user_id))];
    const duplicateProfiles = duplicateIds.length ? await db.from("profiles").select("user_id,first_name,last_name,display_name,email").in("user_id", duplicateIds) : { data: [], error: null };
    if (duplicateProfiles.error) throw new PaymentError("Possible duplicate account details are unavailable.", 503);
    const name = (item: { first_name?: string | null; last_name?: string | null; display_name?: string | null }) => item.display_name?.trim() || [item.first_name, item.last_name].filter(Boolean).join(" ") || "Name unavailable";
    return json({
      requestId: row.request_id,
      userId: row.user_id,
      account: { name: profile.data ? name(profile.data) : "Name unavailable", email: profile.data?.email ?? null },
      status: row.status,
      rejectionReason: row.rejection_reason,
      submittedAt: row.submitted_at,
      reviewedAt: row.reviewed_at,
      reviewedBy: row.reviewed_by,
      reverificationRequestedAt: row.reverification_requested_at,
      reverificationReason: row.reverification_reason,
      duplicateAccounts: (duplicateProfiles.data ?? []).map((item) => ({ userId: item.user_id, name: name(item), email: item.email })),
      history: history.data ?? [],
      documents: {
        front: signedFront.data?.signedUrl ?? null,
        back: signedBack.data?.signedUrl ?? null,
        selfie: signedSelfie.data?.signedUrl ?? null,
      },
    });
  } catch (error) { return paymentResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await context.params;
    if (!z.string().uuid().safeParse(requestId).success) throw new PaymentError("Invalid verification request.", 400);
    const { db, user } = await requireAdmin(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = body?.action;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!body || !["approve", "reject", "request_reverification"].includes(String(action)))
      throw new PaymentError("Choose a valid identity review action.", 400);
    if ((action === "reject" || action === "request_reverification") && (reason.length < 2 || reason.length > 500))
      throw new PaymentError("Enter a reason from 2 to 500 characters.", 400);
    const result = await db.rpc("worksync_admin_review_manual_identity_verification", {
      p_admin_id: user.id,
      p_request_id: requestId,
      p_action: action,
      p_reason: reason || null,
    });
    if (result.error) throw new PaymentError(result.error.message || "Identity review could not be saved.", 409);
    return json({ saved: true });
  } catch (error) { return paymentResponse(error); }
}
