import { supabase } from "@/lib/supabaseClient";

export interface OwnJobApplication {
  application_id: string;
  status: string;
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
    .select("application_id,status")
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
