import { z } from "zod";
import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";
import { projectPlanSnapshotSchema } from "@/services/project/projectPlanSnapshot";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    if (!z.string().uuid().safeParse(jobId).success)
      return json({ error: "Invalid job." }, 400);

    const { db, user } = await paymentUser(request);
    const admin = await db
      .from("admin_members")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (admin.error)
      throw new PaymentError("Unable to verify administrator access.");
    if (!admin.data)
      throw new PaymentError("Administrator access required.", 403);

    const { data: job, error: jobError } = await db
      .from("jobs")
      .select("job_id,client_id,status,deadline,project_type,experience_level")
      .eq("job_id", jobId)
      .maybeSingle();
    if (jobError) throw new PaymentError("Job details are unavailable.");
    if (!job) throw new PaymentError("Job not found.", 404);

    const [clientResult, planApplicationsResult] = await Promise.all([
      db
        .from("client_profiles")
        .select("user_id")
        .eq("client_id", job.client_id)
        .limit(1)
        .maybeSingle(),
      db
        .from("job_applications")
        .select("application_id,freelancer_id,status,proposed_price,proposal,estimated_days,proposed_plan,created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(21),
    ]);
    type AdminJobApplication = {
      application_id: string;
      freelancer_id: string;
      status: string;
      proposed_price: number | string | null;
      proposal: string | null;
      estimated_days: number | string | null;
      proposed_plan?: unknown;
      created_at: string | null;
    };
    let applicationRows = planApplicationsResult.data as AdminJobApplication[] | null;
    let applicationsError = planApplicationsResult.error;
    if (
      planApplicationsResult.error &&
      (planApplicationsResult.error.code === "42703" ||
        planApplicationsResult.error.code === "PGRST204" ||
        planApplicationsResult.error.message.includes("proposed_plan"))
    ) {
      const fallback = await db
        .from("job_applications")
        .select("application_id,freelancer_id,status,proposed_price,proposal,estimated_days,created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(21);
      applicationRows = fallback.data as AdminJobApplication[] | null;
      applicationsError = fallback.error;
    }
    if (clientResult.error || applicationsError)
      throw new PaymentError("Job participants are unavailable.");

    const applications = applicationRows ?? [];
    const visibleApplications = applications.slice(0, 20);
    const freelancerIds = [
      ...new Set(visibleApplications.map((application) => application.freelancer_id)),
    ];
    const freelancersResult = freelancerIds.length
      ? await db
          .from("freelancer_profiles")
          .select("freelancer_id,user_id")
          .in("freelancer_id", freelancerIds)
      : { data: [], error: null };
    if (freelancersResult.error)
      throw new PaymentError("Freelancer names are unavailable.");

    const identityByFreelancerId = new Map(
      (freelancersResult.data ?? []).map((profile) => [
        profile.freelancer_id,
        profile.user_id,
      ]),
    );
    const userIds = [
      ...new Set(
        [clientResult.data?.user_id, ...identityByFreelancerId.values()].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
    const profilesResult = userIds.length
      ? await db
          .from("profiles")
          .select("user_id,display_name,first_name,last_name")
          .in("user_id", userIds)
      : { data: [], error: null };
    if (profilesResult.error)
      throw new PaymentError("Participant names are unavailable.");

    const nameByUserId = new Map(
      (profilesResult.data ?? []).map((profile) => {
        const name =
          profile.display_name?.trim() ||
          [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
        return [profile.user_id, name || "Name unavailable"] as const;
      }),
    );

    return json({
      status: job.status,
      deadline: job.deadline,
      projectType: job.project_type,
      experienceLevel: job.experience_level,
      planSnapshotsAvailable: !planApplicationsResult.error,
      clientName: clientResult.data?.user_id
        ? nameByUserId.get(clientResult.data.user_id) ?? "Name unavailable"
        : "Name unavailable",
      applicants: visibleApplications.map((application) => {
        const userId = identityByFreelancerId.get(application.freelancer_id);
        const parsedPlan = projectPlanSnapshotSchema.safeParse(application.proposed_plan);
        return {
          applicationId: application.application_id,
          name: userId ? nameByUserId.get(userId) ?? "Name unavailable" : "Name unavailable",
          status: application.status,
          proposedPrice: application.proposed_price,
          proposal: application.proposal,
          estimatedDays: application.estimated_days,
          proposedPlan: parsedPlan.success ? parsedPlan.data : null,
          appliedAt: application.created_at,
        };
      }),
      hasMoreApplicants: applications.length > 20,
    });
  } catch (error) {
    return paymentResponse(error);
  }
}
