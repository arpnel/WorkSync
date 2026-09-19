import { supabase } from "@/lib/supabaseClient";

export function databaseError(error: {
  code?: string;
  message: string;
}): Error {
  if (
    ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(
      error.code ?? "",
    )
  ) {
    return new Error(
      "This feature needs the pending WorkSync database update. Your changes were not saved.",
    );
  }
  return new Error(error.message);
}
export async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Please sign in to continue.");
  return data.user;
}
export async function platformAction(
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc(name, args);
  // Keep the actual database diagnostic for application setup failures.
  // The generic pending-update message hides signature and dependency mismatches.
  if (
    error &&
    ["worksync_apply_for_job", "worksync_respond_application"].includes(name) &&
    ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(
      error.code,
    )
  ) {
    throw new Error(
      `Application ${name === "worksync_apply_for_job" ? "submission" : "response"} failed (${error.code}): ${error.message}`,
    );
  }
  if (error) throw databaseError(error);
  return data;
}
