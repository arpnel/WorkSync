import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { z } from "zod";
import { notifyJobApplicationDecision } from "@/services/email/applicationEmails";

export const runtime = "nodejs";
const schema = z.object({ accepted: z.boolean() }).strict();

export async function POST(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return Response.json({ error: "Sign in to respond." }, { status: 401 });
  const { applicationId } = await context.params;
  if (!z.string().uuid().safeParse(applicationId).success)
    return Response.json({ error: "Invalid application." }, { status: 400 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid application response." }, { status: 400 });
  const scoped = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: auth, error: authError } = await scoped.auth.getUser(token);
  if (authError || !auth.user)
    return Response.json({ error: "Your session expired. Sign in again." }, { status: 401 });
  const { data: conversationId, error } = await scoped.rpc("worksync_respond_application", {
    p_application: applicationId,
    p_accept: input.data.accepted,
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  after(async () => {
    try {
      await notifyJobApplicationDecision(applicationId, input.data.accepted, conversationId, request.url);
    } catch {
      console.error("Could not prepare application decision email");
    }
  });
  return Response.json({ conversationId }, { headers: { "Cache-Control": "no-store" } });
}