import { supabase } from "@/lib/supabaseClient";

export interface OwnJobApplication {
  application_id: string;
  status: string;
  proposal: string | null;
  proposed_price: number | null;
  estimated_days: number | null;
}
export function canReapply(status: string | null | undefined) {
  return status === "cancelled" || status === "withdrawn";
}
export async function getOwnJobApplication(
  jobId: string,
): Promise<OwnJobApplication | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) return null;
  const profile = await supabase
    .from("freelancer_profiles")
    .select("freelancer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data) return null;
  const application = await supabase
    .from("job_applications")
    .select("application_id,status,proposal,proposed_price,estimated_days")
    .eq("job_id", jobId)
    .eq("freelancer_id", profile.data.freelancer_id)
    .maybeSingle();
  if (application.error) throw application.error;
  return application.data;
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
): Promise<void> {
  const { error } = await supabase.rpc("worksync_update_job_application", {
    p_application: applicationId,
    p_proposal: proposal.trim(),
    p_proposed_price: price,
    p_estimated_days: days,
  });
  if (error)
    throw new Error(
      `Proposal update failed (${error.code}): ${error.message}`,
    );
}
