import { supabase } from "@/lib/supabaseClient";
import { projectPlanSnapshotSchema, type ProjectPlanSnapshotData } from "@/services/project/projectPlanSnapshot";

export interface OwnJobApplication {
  application_id: string;
  status: string;
  proposal: string | null;
  proposed_price: number | null;
  estimated_days: number | null;
  proposed_plan: ProjectPlanSnapshotData | null;
}
export function canReapply(status: string | null | undefined) {
  return status === "cancelled" || status === "withdrawn";
}
export async function getOwnJobApplication(
  jobId: string,
): Promise<OwnJobApplication | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (error) throw error;
  if (!user) return null;
  const profile = await supabase
    .from("freelancer_profiles")
    .select("freelancer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data) return null;
  const withPlan = await supabase
    .from("job_applications")
    .select("application_id,status,proposal,proposed_price,estimated_days,proposed_plan")
    .eq("job_id", jobId)
    .eq("freelancer_id", profile.data.freelancer_id)
    .maybeSingle();
  let applicationData: (Record<string, unknown> & OwnJobApplication) | null = withPlan.data as (Record<string, unknown> & OwnJobApplication) | null;
  let applicationError = withPlan.error;
  if (withPlan.error && (withPlan.error.code === "42703" || withPlan.error.code === "PGRST204" || withPlan.error.message.includes("proposed_plan"))) {
    const fallback = await supabase
      .from("job_applications")
      .select("application_id,status,proposal,proposed_price,estimated_days")
      .eq("job_id", jobId)
      .eq("freelancer_id", profile.data.freelancer_id)
      .maybeSingle();
    applicationData = fallback.data as (Record<string, unknown> & OwnJobApplication) | null;
    applicationError = fallback.error;
  }
  if (applicationError) throw applicationError;
  if (!applicationData) return null;
  const row = applicationData as Record<string, unknown> & OwnJobApplication & { proposed_plan?: unknown };
  const parsedPlan = projectPlanSnapshotSchema.safeParse(row.proposed_plan);
  return { ...row, proposed_plan: parsedPlan.success ? parsedPlan.data : null };
}
export async function cancelJobApplication(
  applicationId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("worksync_cancel_application", {
    p_application: applicationId,
  });
  if (error)
    throw new Error(
      `Application cancellation failed (${error.code}): ${error.message}`,
    );
  return data;
}

export async function updateJobApplication(
  applicationId: string,
  proposal: string,
  price: number,
  days: number,
  proposedPlan: ProjectPlanSnapshotData | null,
): Promise<void> {
  if (!Number.isFinite(price) || price <= 0 || price > 100_000) {
    throw new Error("Proposed price must be no more than PHP 100,000.");
  }
  const { error } = await supabase.rpc("worksync_update_job_application_with_plan", {
    p_application: applicationId,
    p_proposal: proposal.trim(),
    p_proposed_price: price,
    p_estimated_days: days,
    p_proposed_plan: proposedPlan,
  });
  if (error)
    throw new Error(
      `Proposal update failed (${error.code}): ${error.message}`,
    );
}
