import "server-only";
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { evaluateApplicant, screeningModel } from "@/lib/ai/gemini";
import {
  redactScreeningText,
  RUBRIC_VERSION,
  screeningLabel,
} from "@/lib/ai/screening";

export class ScreeningError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
const running = new Map<string, Promise<unknown>>();
const attempts = new Map<string, { count: number; until: number }>();

async function loadInput(
  db: SupabaseClient,
  userId: string,
  applicationId: string,
) {
  const { data: application, error: applicationError } = await db
    .from("job_applications")
    .select(
      "application_id,job_id,freelancer_id,proposal,proposed_price,estimated_days,created_at,updated_at,screening_id",
    )
    .eq("application_id", applicationId)
    .maybeSingle();
  if (applicationError)
    throw new ScreeningError("Applicant data is unavailable.");
  if (!application) throw new ScreeningError("Application unavailable.", 404);
  const { data: job, error: jobError } = await db
    .from("jobs")
    .select(
      "job_id,client_id,title,description,category_id,budget_min,budget_max,pricing_type,deadline,experience_level,updated_at",
    )
    .eq("job_id", application.job_id)
    .maybeSingle();
  if (jobError || !job) throw new ScreeningError("Job unavailable.", 404);
  const { data: owner, error: ownerError } = await db
    .from("client_profiles")
    .select("client_id")
    .eq("client_id", job.client_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (ownerError || !owner)
    throw new ScreeningError(
      "Only the job owner can screen this application.",
      403,
    );
  const [freelancer, required, offered, category] = await Promise.all([
    db
      .from("freelancer_profiles")
      .select("headline,years_of_experience,employment_preference")
      .eq("freelancer_id", application.freelancer_id)
      .single(),
    db.from("job_skills").select("skill_id").eq("job_id", job.job_id),
    db
      .from("freelancer_skills")
      .select("skill_id")
      .eq("freelancer_id", application.freelancer_id),
    db
      .from("job_categories")
      .select("name")
      .eq("id", job.category_id)
      .maybeSingle(),
  ]);
  if ([freelancer, required, offered, category].some((r) => r.error))
    throw new ScreeningError("Professional information could not be loaded.");
  const ids = [
    ...new Set(
      [...(required.data || []), ...(offered.data || [])].map(
        (s) => s.skill_id,
      ),
    ),
  ];
  const skillRows = ids.length
    ? await db.from("skills").select("id,name").in("id", ids)
    : { data: [], error: null };
  if (skillRows.error) throw new ScreeningError("Skills could not be loaded.");
  const names = new Map((skillRows.data || []).map((s) => [s.id, s.name]));
  const skills = (rows: { skill_id: string }[]) =>
    rows
      .map((s) => redactScreeningText(names.get(s.skill_id), 120))
      .filter(Boolean)
      .sort();
  const text = redactScreeningText;
  const input = {
    job: {
      title: text(job.title, 300),
      description: text(job.description),
      category: text(category.data?.name, 120),
      skills: skills(required.data || []),
      budgetMin: job.budget_min,
      budgetMax: job.budget_max,
      pricingType: job.pricing_type,
      deadline: job.deadline,
      experienceLevel: text(job.experience_level, 120),
    },
    application: {
      proposal: text(application.proposal),
      price: application.proposed_price,
      estimatedDays: application.estimated_days,
      submittedAt: application.created_at,
    },
    freelancer: {
      headline: text(freelancer.data?.headline, 300),
      skills: skills(offered.data || []),
      yearsOfExperience: freelancer.data?.years_of_experience,
      employmentPreference: text(freelancer.data?.employment_preference, 120),
    },
  };
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        version: RUBRIC_VERSION,
        model: screeningModel(),
        input,
      }),
    )
    .digest("hex");
  return { application, job, input, hash };
}

function present(row: Record<string, unknown>) {
  return {
    score: row.score,
    result: screeningLabel(row.result as string),
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    recommendation: row.recommendation,
    screenedAt: row.screened_at,
    expiresAt: row.expires_at,
  };
}

export async function screenApplicant(
  db: SupabaseClient,
  userId: string,
  applicationId: string,
  rateLimitUserId = userId,
) {
  // Authorize each request, including requests joining an in-flight operation.
  const snapshot = await loadInput(db, userId, applicationId);
  const key = `${userId}:${applicationId}:${snapshot.hash}`;
  const existing = running.get(key);
  if (existing) return existing;
  const execute = async () => {
    if (snapshot.application.screening_id) {
      const { data: saved, error } = await db
        .from("screening_results")
        .select("*")
        .eq("screening_id", snapshot.application.screening_id)
        .eq("application_id", applicationId)
        .eq("freelancer_id", snapshot.application.freelancer_id)
        .maybeSingle();
      if (error)
        throw new ScreeningError(
          "Saved screening is unavailable. Check screening access policies.",
        );
      if (
        saved &&
        saved.score !== null &&
        Date.parse(saved.expires_at) > Date.now()
      ) {
        try {
          const metadata = JSON.parse(saved.result);
          if (
            metadata.version === RUBRIC_VERSION &&
            metadata.inputHash === snapshot.hash
          )
            return { screening: present(saved), cached: true };
        } catch {
          /* Legacy labels have no verifiable input fingerprint. */
        }
      }
    }
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret || !process.env.GEMINI_API_KEY)
      throw new ScreeningError(
        "AI screening is not configured on the server yet.",
      );
    const now = Date.now();
    for (const [id, entry] of attempts)
      if (entry.until <= now) attempts.delete(id);
    const allowance = attempts.get(rateLimitUserId) || {
      count: 0,
      until: now + 60000,
    };
    if (allowance.count >= 5 || running.size >= 20)
      throw new ScreeningError(
        "Screening is busy. Please try again in a minute.",
        429,
      );
    allowance.count += 1;
    attempts.set(rateLimitUserId, allowance);
    const evaluation = await evaluateApplicant(snapshot.input);
    const current = await loadInput(db, userId, applicationId);
    if (current.hash !== snapshot.hash)
      throw new ScreeningError(
        "The job or application changed. Please screen it again.",
        409,
      );
    // User-scoped reads above enforce RLS. Only the server may persist AI-produced scores.
    const writer = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await writer.rpc("worksync_save_screening", {
      p_actor: userId,
      p_application: applicationId,
      p_application_updated: snapshot.application.updated_at,
      p_job_updated: snapshot.job.updated_at,
      p_score: evaluation.score,
      p_result: JSON.stringify({
        version: RUBRIC_VERSION,
        inputHash: snapshot.hash,
        label: evaluation.result,
      }),
      p_strengths: JSON.stringify(evaluation.strengths),
      p_weaknesses: JSON.stringify(evaluation.weaknesses),
      p_recommendation: evaluation.recommendation,
    });
    if (error || !data) {
      console.error("Applicant screening persistence failed", {
        code: error?.code,
      });
      throw new ScreeningError(
        "Screening could not be saved. Check the screening database setup and retry.",
      );
    }
    return { screening: present(data), cached: false };
  };
  const task = execute();
  running.set(key, task);
  try {
    return await task;
  } finally {
    running.delete(key);
  }
}
