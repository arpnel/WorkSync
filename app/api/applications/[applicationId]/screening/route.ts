import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  screenApplicant,
  ScreeningError,
} from "@/services/project/applicantScreeningServer";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  try {
    const { applicationId } = await context.params;
    if (!z.string().uuid().safeParse(applicationId).success)
      return json({ error: "Invalid application." }, 400);
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return json({ error: "Sign in to screen applicants." }, 401);
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
      error,
    } = await db.auth.getUser(token);
    if (error || !user)
      return json(
        { error: "Your session expired. Please sign in again." },
        401,
      );
    return json(await screenApplicant(db, user.id, applicationId));
  } catch (error) {
    const providerStatus =
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : undefined;
    const providerMessage =
      providerStatus === 429
        ? "Gemini's request limit or quota was reached. Please try again later."
        : providerStatus === 503
          ? "Gemini is temporarily overloaded. Please retry screening shortly."
          : providerStatus === 404
            ? "The configured Gemini model is unavailable. Check the server's GEMINI_MODEL setting."
            : providerStatus === 401 || providerStatus === 403
              ? "Gemini denied access. Check the server API key and its permissions."
              : error instanceof z.ZodError || error instanceof SyntaxError
                ? "Gemini returned an invalid assessment. Nothing was saved. Please retry."
                : "AI screening is unavailable. Please try again.";
    // Do not log provider messages, tokens, prompts or applicant content.
    console.error("Applicant screening failed", {
      type: error instanceof Error ? error.name : "UnknownError",
      providerStatus,
    });
    return json(
      {
        error:
          error instanceof ScreeningError ? error.message : providerMessage,
      },
      error instanceof ScreeningError ? error.status : 503,
    );
  }
}
