import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
export const runtime = "nodejs";
const ids = z.array(z.string().uuid()).max(40).default([]);
const schema = z
  .object({ userIds: ids, clientIds: ids, freelancerIds: ids })
  .strict();
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  if (!token)
    return json({ error: "Sign in to view marketplace profiles." }, 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid profile request." }, 400);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return json(
      { error: "Marketplace profile lookup is not configured." },
      503,
    );
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const {
      data: { user },
      error,
    } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    ).auth.getUser(token);
    if (error && /api.?key/i.test(error.message))
      return json(
        {
          error:
            "Server authentication is misconfigured. Check the Supabase environment variables in Vercel.",
        },
        503,
      );
    if (error && ![400, 401, 403].includes(error.status ?? 0))
      return json(
        { error: "Unable to verify your session. Please try again shortly." },
        503,
      );
    if (error || !user)
      return json({ error: "Your session expired. Sign in again." }, 401);
    const { clientIds, freelancerIds, userIds } = parsed.data;
    // Only public marketplace identity fields are exposed. Private Users rows,
    // email addresses, resumes, ID documents and Auth metadata never leave here.
    const [clients, freelancers] = await Promise.all([
      clientIds.length || userIds.length
        ? db
            .from("client_profiles")
            .select("client_id,user_id")
            .or(
              [
                clientIds.length ? `client_id.in.(${clientIds.join(",")})` : "",
                userIds.length ? `user_id.in.(${userIds.join(",")})` : "",
              ]
                .filter(Boolean)
                .join(","),
            )
        : Promise.resolve({ data: [], error: null }),
      freelancerIds.length || userIds.length
        ? db
            .from("freelancer_profiles")
            .select(
              "freelancer_id,user_id,headline,hourly_rate,verification_status",
            )
            .or(
              [
                freelancerIds.length
                  ? `freelancer_id.in.(${freelancerIds.join(",")})`
                  : "",
                userIds.length ? `user_id.in.(${userIds.join(",")})` : "",
              ]
                .filter(Boolean)
                .join(","),
            )
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (clients.error || freelancers.error) throw new Error("Lookup failed");
    const relatedIds = [
      ...new Set([
        ...userIds,
        ...(clients.data ?? []).map((row) => row.user_id),
        ...(freelancers.data ?? []).map((row) => row.user_id),
      ]),
    ];
    const profiles = relatedIds.length
      ? await db
          .from("profiles")
          .select(
            "user_id,display_name,first_name,last_name,avatar_url,location,bio,banner_url,created_at,updated_at",
          )
          .in("user_id", relatedIds)
      : { data: [], error: null };
    if (profiles.error) throw new Error("Lookup failed");
    return json({
      profiles: profiles.data ?? [],
      clients: clients.data ?? [],
      freelancers: freelancers.data ?? [],
    });
  } catch {
    return json(
      { error: "Marketplace profiles could not be loaded. Please retry." },
      503,
    );
  }
}
