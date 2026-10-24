import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { moderateCreatedListing } from "@/services/listing/listingModerationServer";

export const runtime = "nodejs";
const inputSchema = z.object({ type: z.enum(["job", "service"]), id: z.string().uuid() }).strict();
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return Response.json({ error: "Sign in to submit a listing." }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid listing." }, { status: 400 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return Response.json({ error: "Your session expired. Please sign in again." }, { status: 401 });
  const ownerQuery = parsed.data.type === "job"
    ? db.from("jobs").select("job_id,client_profiles!inner(user_id)").eq("job_id", parsed.data.id).maybeSingle()
    : db.from("services").select("service_id,freelancer_profiles!inner(user_id)").eq("service_id", parsed.data.id).maybeSingle();
  const { data, error } = await ownerQuery;
  if (error || !data) return Response.json({ error: "Listing submission was not found." }, { status: 404 });
  const profile = parsed.data.type === "job" ? (data as { client_profiles?: { user_id?: string } }).client_profiles : (data as { freelancer_profiles?: { user_id?: string } }).freelancer_profiles;
  if (profile?.user_id !== auth.user.id) return Response.json({ error: "You cannot submit another user's listing." }, { status: 403 });
  const { error: submitError } = await db.rpc("worksync_submit_listing", {
    p_kind: parsed.data.type,
    p_listing: parsed.data.id,
  });
  if (submitError) {
    console.error("Listing could not enter moderation", {
      type: parsed.data.type,
      code: submitError.code,
    });
    return Response.json(
      { error: "The listing could not be submitted for moderation. It remains hidden; retry from My Listings." },
      { status: 503 },
    );
  }
  try {
    after(() => moderateCreatedListing(parsed.data.type, parsed.data.id, auth.user.id));
  } catch {
    return Response.json({ error: "Moderation could not be scheduled. The listing remains hidden for administrator review." }, { status: 503 });
  }
  return Response.json({ queued: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
