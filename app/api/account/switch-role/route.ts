import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({ role: z.enum(["client", "freelancer"]) }).strict();
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to switch accounts." }, 401);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid account role." }, 400);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey)
    return json({ error: "Account switching is not configured on the server." }, 503);

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user)
    return json({ error: "Your session expired. Please sign in again." }, 401);

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = authData.user.id;
  const { role } = parsed.data;

  if (role === "client") {
    const { data: clientProfile, error } = await db
      .from("client_profiles")
      .select("client_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return json({ error: "Unable to check your client profile." }, 500);
    if (!clientProfile) {
      const { error: insertError } = await db
        .from("client_profiles")
        .insert({ user_id: userId });
      if (insertError)
        return json({ error: "Unable to create your client profile." }, 500);
    }
  } else {
    const { data: freelancerProfile, error } = await db
      .from("freelancer_profiles")
      .select("freelancer_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return json({ error: "Unable to check your freelancer profile." }, 500);
    if (!freelancerProfile)
      return json({ error: "A freelancer profile is required to switch roles." }, 409);
  }

  const { data: updatedUser, error: updateError } = await db
    .from("Users")
    .update({ role })
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  if (updateError)
    return json({ error: "Unable to update your account role." }, 500);
  if (!updatedUser)
    return json({ error: "Your WorkSync account could not be found." }, 404);
  return json({ ok: true, role });
}
