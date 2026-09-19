import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { screenNewApplication } from "@/services/project/automaticScreeningServer";

export const runtime = "nodejs";
export const maxDuration = 120;
const inputSchema = z
  .object({
    jobId: z.string().uuid(),
    proposal: z.string().trim().min(1).max(10000),
    price: z.number().finite().positive(),
    days: z.number().int().positive().max(2147483647),
  })
  .strict();

export async function POST(request: Request) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to apply." }, 401);
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return json(
      { error: "Enter a valid proposal, price and delivery time." },
      400,
    );
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser(token);
    if (authError || !user)
      return json(
        { error: "Your session expired. Please sign in again." },
        401,
      );
    const { jobId, proposal, price, days } = input.data;
    let { data: applicationId, error } = await db.rpc(
      "worksync_apply_for_job",
      {
        p_job_id: jobId,
        p_proposal: proposal,
        p_proposed_price: price,
        p_estimated_days: days,
      },
    );
    // Older installations use the parameter names shipped in the core migration.
    // Retry only a missing-signature response: the first call did not execute.
    if (error?.code === "PGRST202") {
      const legacy = await db.rpc("worksync_apply_for_job", {
        p_job: jobId,
        p_proposal: proposal,
        p_price: price,
        p_days: days,
      });
      applicationId = legacy.data;
      error = legacy.error;
    }
    if (error)
      return json(
        {
          error: `Application submission failed (${error.code}): ${error.message}`,
        },
        400,
      );
    // Register server-managed work before returning; closing the browser doesn't cancel it.
    try {
      after(() => screenNewApplication(applicationId, user.id));
    } catch {
      console.error("Automatic screening could not be scheduled", {
        applicationId,
      });
    }
    return json({ applicationId }, 201);
  } catch {
    return json(
      {
        error:
          "Application submission could not be confirmed. Check your Requests before retrying.",
      },
      503,
    );
  }
}
