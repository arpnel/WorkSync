import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { screenNewApplication } from "@/services/project/automaticScreeningServer";
import { notifyJobApplicationReceived } from "@/services/email/applicationEmails";
import { projectPlanSnapshotSchema } from "@/services/project/projectPlanSnapshot";

export const runtime = "nodejs";
export const maxDuration = 120;
const inputSchema = z
  .object({
    jobId: z.string().uuid(),
    proposal: z.string().trim().min(1).max(10000),
    price: z.number().finite().positive(),
    days: z.number().int().positive().max(2147483647),
    proposedPlan: projectPlanSnapshotSchema.nullable().optional(),
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
    let applicationId: string | null = null;
    let error;
    if (input.data.proposedPlan) {
      if (
        new TextEncoder().encode(JSON.stringify(input.data.proposedPlan))
          .length > 200_000
      )
        return json({ error: "The attached plan is too large." }, 400);
      const result = await db.rpc("worksync_apply_for_job_with_plan", {
        p_job_id: jobId,
        p_proposal: proposal,
        p_proposed_price: price,
        p_estimated_days: days,
        p_proposed_plan: input.data.proposedPlan,
      });
      applicationId = result.data;
      error = result.error;
      if (error?.code === "PGRST202")
        return json(
          {
            error:
              "Saving attached plans is not enabled yet. The approved project plan database migration must be applied first.",
          },
          503,
        );
    } else {
      const result = await db.rpc("worksync_apply_for_job", {
        p_job_id: jobId,
        p_proposal: proposal,
        p_proposed_price: price,
        p_estimated_days: days,
      });
      applicationId = result.data;
      error = result.error;
      // Older installations use the argument names shipped in the core migration.
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
    }
    if (error)
      return json(
        {
          error: `Application submission failed (${error.code}): ${error.message}`,
        },
        400,
      );
    if (!applicationId)
      return json(
        {
          error:
            "Application submission could not be confirmed. Check your Requests before retrying.",
        },
        503,
      );
    // Register server-managed work before returning; closing the browser doesn't cancel it.
    try {
      after(() => screenNewApplication(applicationId, user.id));
    } catch {
      console.error("Automatic screening could not be scheduled", {
        applicationId,
      });
    }
    after(async () => {
      try {
        await notifyJobApplicationReceived(applicationId, user.id, request.url);
      } catch {
        console.error("Could not prepare new application email");
      }
    });
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
