import { supabase } from "@/lib/supabaseClient";
import type { ScreeningResult } from "./projectRequestService";

export class FreeScreeningLimitError extends Error {
  constructor(
    public used: number,
    public limit: number,
    public resetAt: string | null,
  ) {
    super("The Free plan includes one AI applicant screening every six months.");
  }
}

export interface ApplicantScreeningResponse {
  screening: ScreeningResult;
  quota?: { used: number; limit: number; resetAt: string | null };
}

export async function requestApplicantScreening(
  applicationId: string,
  options: { force?: boolean } = {},
): Promise<ApplicantScreeningResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to screen applicants.");
  const response = await fetch(
    `/api/applications/${encodeURIComponent(applicationId)}/screening`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(options.force ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.force ? { body: JSON.stringify({ force: true }) } : {}),
    },
  );
  const data = await response.json().catch(() => null);
  if (data?.code === "FREE_SCREENING_LIMIT_REACHED")
    throw new FreeScreeningLimitError(
      typeof data.used === "number" ? data.used : 1,
      typeof data.limit === "number" ? data.limit : 1,
      typeof data.resetAt === "string" ? data.resetAt : null,
    );
  if (!response.ok || !data?.screening)
    throw new Error(
      data?.error || "Screening is unavailable. Please try again.",
    );
  return data as ApplicantScreeningResponse;
}
