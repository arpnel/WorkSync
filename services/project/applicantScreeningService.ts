import { supabase } from "@/lib/supabaseClient";
import type { ScreeningResult } from "./projectRequestService";

export async function requestApplicantScreening(
  applicationId: string,
): Promise<ScreeningResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to screen applicants.");
  const response = await fetch(
    `/api/applications/${encodeURIComponent(applicationId)}/screening`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.screening)
    throw new Error(
      data?.error || "Screening is unavailable. Please try again.",
    );
  return data.screening;
}
