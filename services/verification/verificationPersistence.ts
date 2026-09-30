import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VerificationError } from "@/lib/verification/didit";

export type VerificationAssociation = {
  session_id: string;
  workflow_id: string;
  url: string;
};
export type VerificationResult = {
  requestStatus: "pending" | "approved" | "rejected" | "expired";
  profileStatus: "pending" | "approved" | "rejected";
};
type RequestRow = {
  request_id: string;
  user_id: string;
  provider: string;
  provider_session_id: string;
  workflow_id: string;
  status: string;
  provider_status: string;
  is_current: boolean;
  verified_at: string | null;
};
const columns =
  "request_id,user_id,provider,provider_session_id,workflow_id,status,provider_status,is_current,verified_at";
function failure(stage: string, code?: string): never {
  // Only diagnostic stage and database code; never payloads or database detail text.
  console.error("Didit persistence failed", { stage, code: code ?? "unknown" });
  throw new VerificationError(
    "Verification could not be synchronized. Please retry.",
  );
}
export async function findVerificationRequest(
  db: SupabaseClient,
  userId: string,
  session: VerificationAssociation,
) {
  const { data, error } = await db
    .from("verification_requests")
    .select(columns)
    .eq("provider_session_id", session.session_id)
    .maybeSingle();
  if (error) failure("request_read", error.code);
  const row = data as RequestRow | null;
  if (
    row &&
    (row.user_id !== userId ||
      row.provider !== "didit" ||
      row.workflow_id !== session.workflow_id)
  )
    throw new VerificationError(
      "Verification session association does not match.",
      409,
    );
  return row;
}

export async function ensureVerificationRequest(
  db: SupabaseClient,
  userId: string,
  session: VerificationAssociation,
) {
  const existing = await findVerificationRequest(db, userId, session);
  if (existing) {
    if (!existing.is_current)
      throw new VerificationError(
        "Verification session is no longer current.",
        409,
      );
    return existing;
  }
  const conflicts = await db
    .from("verification_requests")
    .select(columns)
    .eq("user_id", userId)
    .or("is_current.eq.true,status.eq.pending");
  if (conflicts.error) failure("current_request_read", conflicts.error.code);
  if (
    conflicts.data?.some(
      (row) => row.provider_session_id === session.session_id,
    )
  ) {
    const concurrent = await findVerificationRequest(db, userId, session);
    if (concurrent?.is_current) return concurrent;
    throw new VerificationError(
      "Verification session is no longer current.",
      409,
    );
  }
  // Never cancel a manual review or an uncompleted competing session to make room.
  if (
    conflicts.data?.some(
      (row) => row.status === "pending" || row.provider !== "didit",
    )
  )
    throw new VerificationError(
      "An existing verification request must be resolved before starting another.",
      409,
    );
  for (const row of conflicts.data ?? []) {
    const retired = await db
      .from("verification_requests")
      .update({ is_current: false })
      .eq("request_id", row.request_id)
      .eq("user_id", userId)
      .eq("status", row.status)
      .eq("is_current", true)
      .select("request_id");
    if (retired.error) failure("retire_request", retired.error.code);
    if (!retired.data?.length)
      throw new VerificationError(
        "Verification changed. Retry with the current session.",
        409,
      );
  }
  // A partial unique index cannot be targeted reliably by PostgREST onConflict.
  // INSERT + 23505 re-read uses the existing session index without inventing a key.
  const inserted = await db.from("verification_requests").insert({
    user_id: userId,
    provider: "didit",
    provider_session_id: session.session_id,
    workflow_id: session.workflow_id,
    verification_url: session.url,
    status: "pending",
    provider_status: "Not Started",
    is_current: true,
    document_paths: [],
    notes: "",
  });
  if (inserted.error && inserted.error.code !== "23505")
    failure("request_insert", inserted.error.code);
  const result = await findVerificationRequest(db, userId, session);
  if (!result?.is_current)
    throw new VerificationError(
      "Another verification request is current. Retry after refreshing your verification status.",
      409,
    );
  return result;
}

export async function persistVerificationResult(
  db: SupabaseClient,
  userId: string,
  session: VerificationAssociation,
  providerStatus: string,
  result: VerificationResult,
) {
  const row = await ensureVerificationRequest(db, userId, session);
  if (
    row.status !== result.requestStatus ||
    row.provider_status !== providerStatus ||
    (result.requestStatus === "approved"
      ? !row.verified_at
      : row.verified_at !== null)
  ) {
    const updated = await db
      .from("verification_requests")
      .update({
        status: result.requestStatus,
        provider_status: providerStatus,
        verified_at:
          result.requestStatus === "approved"
            ? (row.verified_at ?? new Date().toISOString())
            : null,
      })
      .eq("provider_session_id", session.session_id)
      .eq("user_id", userId)
      .eq("provider", "didit")
      .eq("is_current", true)
      .select("request_id");
    if (updated.error) failure("request_update", updated.error.code);
    if (!updated.data?.length)
      throw new VerificationError(
        "Verification session is no longer current.",
        409,
      );
  }
  // No row is valid for client-only users. Never create a freelancer profile here.
  const profile = await db
    .from("freelancer_profiles")
    .update({ verification_status: result.profileStatus })
    .eq("user_id", userId)
    .or(
      `verification_status.is.null,verification_status.neq.${result.profileStatus}`,
    );
  if (profile.error) failure("profile_update", profile.error.code);
  // The caller writes the metadata event marker only after both writes succeed.
  // Re-delivery repairs a partial failure; cross-table atomicity requires a DB RPC.
}
