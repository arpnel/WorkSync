import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const admin = await db.from("admin_members").select("user_id").eq("user_id", user.id).maybeSingle();
    if (admin.error || !admin.data) throw new PaymentError("Administrator access required.", 403);
    if (new URL(request.url).searchParams.get("countsOnly") === "1") {
      const pending = await db.from("manual_identity_verification_requests")
        .select("request_id", { count: "exact", head: true })
        .eq("is_current", true).eq("status", "pending");
      if (pending.error) throw new PaymentError("Identity verification count is unavailable.", 503);
      return json({ pendingCount: pending.count ?? 0 });
    }
    const result = await db.from("manual_identity_verification_requests")
      .select("request_id,user_id,status,submitted_at,rejection_reason,id_fingerprint", { count: "exact" })
      .eq("is_current", true).order("submitted_at", { ascending: false }).limit(1000);
    if (result.error) throw new PaymentError("Identity verification queue is unavailable. The prepared database migration must be applied.", 503);
    const rows = result.data ?? [];
    const userIds = [...new Set(rows.map((row) => row.user_id))];
    const profiles = userIds.length ? await db.from("profiles").select("user_id,first_name,last_name,display_name,email").in("user_id", userIds) : { data: [], error: null };
    if (profiles.error) throw new PaymentError("Verification account details are unavailable.", 503);
    const profileMap = new Map((profiles.data ?? []).map((profile) => [profile.user_id, profile]));
    const fingerprints = [...new Set(rows.map((row) => row.id_fingerprint).filter((value): value is string => Boolean(value)))];
    const duplicates = fingerprints.length ? await db.from("manual_identity_verification_requests").select("user_id,id_fingerprint").eq("is_current", true).in("id_fingerprint", fingerprints) : { data: [], error: null };
    if (duplicates.error) throw new PaymentError("Duplicate account indicators are unavailable.", 503);
    const duplicateCounts = new Map<string, Set<string>>();
    for (const row of duplicates.data ?? []) {
      const set = duplicateCounts.get(row.id_fingerprint) ?? new Set<string>();
      set.add(row.user_id);
      duplicateCounts.set(row.id_fingerprint, set);
    }
    const query = new URL(request.url).searchParams.get("search")?.trim().toLocaleLowerCase() ?? "";
    const name = (profile: { first_name?: string | null; last_name?: string | null; display_name?: string | null } | undefined) => profile?.display_name?.trim() || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Name unavailable";
    const mapped = rows.map((row) => {
      const profile = profileMap.get(row.user_id);
      const possibleDuplicates = row.id_fingerprint ? Math.max(0, (duplicateCounts.get(row.id_fingerprint)?.size ?? 0) - 1) : 0;
      return {
        id: row.request_id,
        title: name(profile),
        status: row.status,
        created_at: row.submitted_at,
        owner_id: row.user_id,
        detail: [`Applicant: ${row.user_id}`, `Email: ${profile?.email ?? "Not available"}`, `Submitted: ${row.submitted_at}`, `Status: ${row.status}`, `Possible duplicate accounts: ${possibleDuplicates}`].join("\n"),
      };
    }).filter((row) => !query || [row.id, row.title, row.status, row.detail].some((value) => value.toLocaleLowerCase().includes(query)));
    return json({ rows: mapped, total: mapped.length, limit: mapped.length, offset: 0, hasNext: false });
  } catch (error) { return paymentResponse(error); }
}


