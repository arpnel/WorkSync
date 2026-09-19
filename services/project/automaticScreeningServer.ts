import "server-only";
import { createClient } from "@supabase/supabase-js";
import { screenApplicant } from "./applicantScreeningServer";

// Called only with the ID returned by a successful, user-authenticated application RPC.
export async function screenNewApplication(
  applicationId: string,
  applicantUserId: string,
) {
  try {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret || !process.env.GEMINI_API_KEY)
      throw new Error("Screening configuration missing");
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const application = await db
      .from("job_applications")
      .select("job_id,freelancer_id")
      .eq("application_id", applicationId)
      .single();
    if (application.error || !application.data)
      throw new Error("Application unavailable");
    const freelancer = await db
      .from("freelancer_profiles")
      .select("user_id")
      .eq("freelancer_id", application.data.freelancer_id)
      .single();
    if (freelancer.error || freelancer.data?.user_id !== applicantUserId)
      throw new Error("Applicant mismatch");
    const job = await db
      .from("jobs")
      .select("client_id")
      .eq("job_id", application.data.job_id)
      .single();
    if (job.error || !job.data) throw new Error("Job unavailable");
    const owner = await db
      .from("client_profiles")
      .select("user_id")
      .eq("client_id", job.data.client_id)
      .single();
    if (owner.error || !owner.data) throw new Error("Job owner unavailable");
    // Resolve the real owner from the database for the existing owner-checked save RPC.
    // No owner ID, professional evidence, or AI score is accepted from the browser.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await screenApplicant(
          db,
          owner.data.user_id,
          applicationId,
          applicantUserId,
        );
        return;
      } catch (error) {
        const status =
          error && typeof error === "object" && "status" in error
            ? error.status
            : null;
        if (attempt === 0 && (status === 503 || status === 429)) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    // A failed assessment must never undo or report failure for the saved application.
    console.error("Automatic applicant screening failed", {
      applicationId,
      type: error instanceof Error ? error.name : "UnknownError",
      status:
        error && typeof error === "object" && "status" in error
          ? error.status
          : undefined,
    });
  }
}
