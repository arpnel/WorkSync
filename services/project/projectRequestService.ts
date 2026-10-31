import {
  getPublicIdentities,
  identityName,
} from "@/services/profile/publicIdentityService";
import { supabase } from "@/lib/supabaseClient";
import { invalidatePageReads } from "@/lib/pageReadCache";
import { screeningLabel } from "@/lib/ai/screening";
import { assertFreelancerAvailable } from "@/services/marketplace/freelancerAvailability";
import { getActiveAccountContext } from "@/services/marketplace/AccountServices";
import { traceProjectFlow } from "@/services/project/projectFlowDiagnostics";
import {
  projectPlanSnapshotSchema,
  type ProjectPlanSnapshotData,
} from "@/services/project/projectPlanSnapshot";

export interface ScreeningResult {
  score: number | null;
  result: string | null;
  strengths: string | null;
  weaknesses: string | null;
  recommendation: string | null;
  screenedAt: string | null;
  expiresAt: string | null;
}

export interface ProjectRequest {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  jobDescription: string;
  jobPostedAt: string | null;
  categoryName: string | null;
  jobBudget: number | null;
  clientUserId: string;
  clientName: string;
  clientAvatar: string | null;
  currentParty: "client" | "freelancer";
  freelancerId: string;
  freelancerUserId: string;
  freelancerName: string;
  freelancerHeadline: string | null;
  freelancerAvatar: string | null;
  yearsOfExperience: number | null;
  rating: number | null;
  completedProjects: number;
  skills: string[];
  portfolio: Array<{
    id: string;
    title: string | null;
    projectUrl: string | null;
  }>;
  proposal: string | null;
  proposedPlan: ProjectPlanSnapshotData | null;
  proposedPrice: number | null;
  estimatedDays: number | null;
  status: string;
  createdAt: string;
  screening: ScreeningResult | null;
}

export interface ProjectRequestData {
  received: ProjectRequest[];
  sent: ProjectRequest[];
  discussions: ProjectRequest[];
}

// Supabase's generated relation shapes are not available in this project yet.
// Keep this adapter local so the exported request model remains fully typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const applicationFields =
  "application_id, job_id, freelancer_id, proposal, proposed_price, estimated_days, status, screening_id, created_at";
const applicationFieldsWithPlan = `${applicationFields}, proposed_plan`;
type ApplicationQueryResult = {
  data: unknown[] | null;
  error: { code?: string; message: string } | null;
};

async function readApplications(
  query: (fields: string) => PromiseLike<ApplicationQueryResult>,
): Promise<Row[]> {
  let result = await query(applicationFieldsWithPlan);
  const missingPlanField =
    result.error &&
    (result.error.code === "PGRST204" ||
      result.error.code === "42703" ||
      result.error.message.includes("proposed_plan"));
  if (missingPlanField) result = await query(applicationFields);
  if (result.error) throw result.error;
  return (result.data ?? []).map((item) => {
    const row = item as Row;
    const parsedPlan = projectPlanSnapshotSchema.safeParse(row.proposed_plan);
    return {
      ...row,
      proposed_plan: parsedPlan.success ? parsedPlan.data : null,
    };
  });
}

export async function getProjectRequests(): Promise<ProjectRequestData> {
  const account = await getActiveAccountContext();

  let receivedRows: Row[] = [];
  if (account.role === "client" && account.profileId) {
    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select("job_id")
      .eq("client_id", account.profileId);
    if (jobsError) throw jobsError;
    const jobIds = (jobs ?? []).map((job) => job.job_id);
    if (jobIds.length) {
      receivedRows = await readApplications((fields) =>
        supabase
          .from("job_applications")
          .select(fields)
          .in("job_id", jobIds)
          .order("created_at", { ascending: false }),
      );
    }
  }

  let sentRows: Row[] = [];
  if (account.role === "freelancer" && account.profileId) {
    sentRows = await readApplications((fields) =>
      supabase
        .from("job_applications")
        .select(fields)
        .eq("freelancer_id", account.profileId)
        .order("created_at", { ascending: false }),
    );
  }

  const allRows = [...receivedRows, ...sentRows];
  if (!allRows.length) return { received: [], sent: [], discussions: [] };

  const jobIds = [...new Set(allRows.map((row) => row.job_id))];
  const freelancerIds = [...new Set(allRows.map((row) => row.freelancer_id))];
  const screeningIds = [
    ...new Set(allRows.map((row) => row.screening_id).filter(Boolean)),
  ];

  const [
    jobsResult,
    freelancersResult,
    screeningsResult,
    skillsResult,
    portfolioResult,
    reviewsResult,
    projectsResult,
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("job_id, client_id, title, description, created_at, budget_min, budget_max, category_id")
      .in("job_id", jobIds),
    supabase
      .from("freelancer_profiles")
      .select("freelancer_id, user_id, headline, years_of_experience")
      .in("freelancer_id", freelancerIds),
    screeningIds.length
      ? supabase
          .from("screening_results")
          .select(
            "screening_id, score, result, strengths, weaknesses, recommendation, screened_at, expires_at",
          )
          .in("screening_id", screeningIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("freelancer_skills")
      .select("freelancer_id, skill_id")
      .in("freelancer_id", freelancerIds),
    supabase
      .from("portfolio")
      .select("portfolio_id, freelancer_id, title, project_url")
      .in("freelancer_id", freelancerIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("reviews")
      .select("freelancer_id, rating")
      .in("freelancer_id", freelancerIds),
    supabase
      .from("projects")
      .select("freelancer_id, status")
      .in("freelancer_id", freelancerIds)
      .eq("status", "completed"),
  ]);
  for (const result of [
    jobsResult,
    freelancersResult,
    screeningsResult,
    skillsResult,
    portfolioResult,
    reviewsResult,
    projectsResult,
  ]) {
    if (result.error) throw result.error;
  }

  const identities = await getPublicIdentities({
    freelancerIds,
    clientIds: [
      ...new Set(
        (jobsResult.data ?? []).map((row) => row.client_id).filter(Boolean),
      ),
    ],
  });
  const publicProfiles = new Map(
    identities.profiles.map((row) => [row.user_id, row]),
  );
  const publicFreelancers = new Map(
    identities.freelancers.map((row) => [row.freelancer_id, row]),
  );
  const publicClients = new Map(
    identities.clients.map((row) => [row.client_id, row]),
  );
  const categoryIds = [
    ...new Set(
      (jobsResult.data ?? []).map((row) => row.category_id).filter(Boolean),
    ),
  ];
  const skillIds = [
    ...new Set((skillsResult.data ?? []).map((row) => row.skill_id)),
  ];
  const [categoriesResult, skillNamesResult] = await Promise.all([
    categoryIds.length
      ? supabase.from("job_categories").select("id, name").in("id", categoryIds)
      : Promise.resolve({ data: [], error: null }),
    skillIds.length
      ? supabase.from("skills").select("id, name").in("id", skillIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [categoriesResult, skillNamesResult]) {
    if (result.error) throw result.error;
  }

  const by = (rows: Row[] | null, key: string) =>
    new Map((rows ?? []).map((row) => [row[key], row]));
  const jobs = by(jobsResult.data, "job_id");
  const freelancers = by(freelancersResult.data, "freelancer_id");
  const screenings = by(screeningsResult.data, "screening_id");
  const categories = by(categoriesResult.data, "id");
  const skillNames = by(skillNamesResult.data, "id");

  const mapRow = (row: Row): ProjectRequest => {
    const job = jobs.get(row.job_id);
    const freelancer: Row = {
      ...freelancers.get(row.freelancer_id),
      ...publicFreelancers.get(row.freelancer_id),
    };
    const profile = publicProfiles.get(freelancer?.user_id ?? "");
    const client = publicClients.get(job?.client_id);
    const clientProfile = publicProfiles.get(client?.user_id ?? "");
    const screening = screenings.get(row.screening_id);
    const ratings = (reviewsResult.data ?? [])
      .filter((review) => review.freelancer_id === row.freelancer_id)
      .map((review) => Number(review.rating));
    return {
      applicationId: row.application_id,
      jobId: row.job_id,
      jobTitle: job?.title ?? "Untitled job",
      jobDescription: job?.description ?? "",
      jobPostedAt: job?.created_at ?? null,
      categoryName: categories.get(job?.category_id)?.name ?? null,
      jobBudget: job?.budget_max ?? job?.budget_min ?? null,
      clientUserId: client?.user_id ?? "",
      clientName: identityName(clientProfile, "Client profile unavailable"),
      clientAvatar: clientProfile?.avatar_url ?? null,
      currentParty: account.role,
      freelancerId: row.freelancer_id,
      freelancerUserId: freelancer?.user_id ?? "",
      freelancerName: identityName(profile, "Freelancer profile unavailable"),
      freelancerHeadline: freelancer?.headline ?? null,
      freelancerAvatar: profile?.avatar_url ?? null,
      yearsOfExperience: freelancer?.years_of_experience ?? null,
      rating: ratings.length
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : null,
      completedProjects: (projectsResult.data ?? []).filter(
        (project) => project.freelancer_id === row.freelancer_id,
      ).length,
      skills: (skillsResult.data ?? [])
        .filter((item) => item.freelancer_id === row.freelancer_id)
        .map((item) => skillNames.get(item.skill_id)?.name)
        .filter(Boolean),
      portfolio: (portfolioResult.data ?? [])
        .filter((item) => item.freelancer_id === row.freelancer_id)
        .slice(0, 3)
        .map((item) => ({
          id: item.portfolio_id,
          title: item.title,
          projectUrl: item.project_url,
        })),
      proposal: row.proposal,
      proposedPlan: row.proposed_plan,
      proposedPrice: row.proposed_price,
      estimatedDays: row.estimated_days,
      status: row.status,
      createdAt: row.created_at,
      screening: screening
        ? {
            score: screening.score,
            result: screeningLabel(screening.result),
            strengths: screening.strengths,
            weaknesses: screening.weaknesses,
            recommendation: screening.recommendation,
            screenedAt: screening.screened_at,
            expiresAt: screening.expires_at,
          }
        : null,
    };
  };

  const received = receivedRows
    .map(mapRow)
    .filter((item) => !["rejected", "cancelled", "withdrawn"].includes(item.status));
  const sent = sentRows.map(mapRow);
  const discussions = [...received, ...sent].filter(
    (item, index, items) =>
      item.status === "accepted" &&
      items.findIndex(
        (candidate) => candidate.applicationId === item.applicationId,
      ) === index,
  );
  return {
    received: received.filter((item) => item.status !== "accepted"),
    sent: sent.filter((item) => item.status !== "accepted"),
    discussions,
  };
}

export async function rejectProjectRequest(applicationId: string) {
  await respondToApplication(applicationId, false);
}
export async function startProjectDiscussion(
  request: ProjectRequest,
): Promise<string> {
  if (request.status !== "accepted")
    await assertFreelancerAvailable(request.freelancerId);
  return respondToApplication(request.applicationId, true);
}
async function respondToApplication(applicationId: string, accepted: boolean) {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token)
    throw new Error("Sign in to respond to this application.");
  const response = await fetch(`/api/applications/${applicationId}/respond`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ accepted }),
    cache: "no-store",
  });
  const result = (await response.json().catch(() => null)) as {
    conversationId?: string | null;
    error?: string;
  } | null;
  if (!response.ok)
    throw new Error(result?.error ?? "Unable to respond to this application.");
  if (accepted) {
    traceProjectFlow("application acceptance response received", {
      applicationId,
      accepted,
      returnedIdType: "conversation_id",
      conversationId: result?.conversationId ?? null,
      httpStatus: response.status,
    });
  }
  if (accepted) invalidatePageReads();
  return result?.conversationId ?? "";
}
