import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { passwordMeetsRequirements } from "@/lib/validation/auth.validation";

export const runtime = "nodejs";
const schema = z.object({ action: z.enum(["signup", "change", "reset"]), password: z.string().min(1).max(256), currentPassword: z.string().min(1).max(256).optional(), email: z.string().email().optional(), firstName: z.string().trim().min(1).max(50).optional(), lastName: z.string().trim().min(1).max(50).optional() }).strict();

export async function POST(request: Request) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success || !passwordMeetsRequirements(input.data.password)) return Response.json({ error: "Password must have at least 8 characters, uppercase and lowercase letters, a number, and a special character." }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (input.data.action === "signup") {
    if (!input.data.email || !input.data.firstName || !input.data.lastName) return Response.json({ error: "Enter your email and name." }, { status: 400 });
    const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await auth.auth.signUp({ email: input.data.email.trim().toLowerCase(), password: input.data.password, options: { emailRedirectTo: new URL("/auth/callback", request.url).toString(), data: { first_name: input.data.firstName, last_name: input.data.lastName, role: "client" } } });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    if (!data.user) return Response.json({ error: "Account creation was not confirmed." }, { status: 503 });
    return Response.json({ user: data.user }, { status: 201 });
  }
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return Response.json({ error: "Sign in to change your password." }, { status: 401 });
  const scoped = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await scoped.auth.getUser(token);
  if (authError || !auth.user) return Response.json({ error: "Your session expired. Please sign in again." }, { status: 401 });
  if (input.data.action === "change" && !input.data.currentPassword) return Response.json({ error: "Enter your current password to continue." }, { status: 400 });
  if (input.data.action === "reset") {
    const { data: claims, error: claimsError } = await scoped.auth.getClaims(token);
    const methods = claims?.claims?.amr;
    const isRecoverySession = Array.isArray(methods) && methods.some((method) =>
      typeof method === "string" ? method === "recovery" : method?.method === "recovery",
    );
    if (claimsError || !isRecoverySession) return Response.json({ error: "This password reset session is invalid or expired. Request a new reset link." }, { status: 403 });
  }
  const update = input.data.action === "change"
    ? await scoped.auth.updateUser({ password: input.data.password, current_password: input.data.currentPassword! })
    : await scoped.auth.updateUser({ password: input.data.password });
  const { error } = update;
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}
