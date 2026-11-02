import { z } from "zod";
import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    if (!z.string().uuid().safeParse(projectId).success)
      return json({ error: "Invalid project." }, 400);

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

    const { data: project, error: projectError } = await db
      .from("projects")
      .select(
        "project_id,title,description,status,budget,project_type,start_date,due_date,completed_at,created_at,updated_at,order_id,application_id,client_id,freelancer_id",
      )
      .eq("project_id", projectId)
      .maybeSingle();
    if (projectError)
      throw new PaymentError("Project details are unavailable.");
    if (!project) throw new PaymentError("Project not found.", 404);

    const [clientResult, freelancerResult, taskResult] = await Promise.all([
      db
        .from("client_profiles")
        .select("user_id")
        .eq("client_id", project.client_id)
        .maybeSingle(),
      db
        .from("freelancer_profiles")
        .select("user_id")
        .eq("freelancer_id", project.freelancer_id)
        .maybeSingle(),
      db
        .from("project_tasks")
        .select("status,due_date", { count: "exact" })
        .eq("project_id", projectId)
        .limit(500),
    ]);
    const userIds = [
      clientResult.data?.user_id,
      freelancerResult.data?.user_id,
    ].filter((id): id is string => Boolean(id));
    const profilesResult = userIds.length
      ? await db
          .from("profiles")
          .select("user_id,display_name,first_name,last_name")
          .in("user_id", [...new Set(userIds)])
      : { data: [], error: null };
    const nameByUserId = new Map(
      (profilesResult.data ?? []).map((profile) => {
        const name =
          profile.display_name?.trim() ||
          [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
        return [profile.user_id, name || "Name unavailable"] as const;
      }),
    );

    const contractSelect =
      "contract_id,status,final_price,delivery_time_days,revisions_count,created_at,updated_at,client_signed_at,freelancer_signed_at,current_version,client_signed_version,freelancer_signed_version";
    const contractResults = await Promise.all([
      project.order_id
        ? db
            .from("contracts")
            .select(contractSelect)
            .eq("order_id", project.order_id)
            .order("created_at", { ascending: false })
            .limit(1)
        : Promise.resolve({ data: [], error: null }),
      project.application_id
        ? db
            .from("contracts")
            .select(contractSelect)
            .eq("application_id", project.application_id)
            .order("created_at", { ascending: false })
            .limit(1)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const contractAvailable = !contractResults.some((result) => result.error);
    const contract = contractAvailable ? contractResults
      .flatMap((result) => result.data ?? [])
      .sort(
        (a, b) =>
          Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""),
      )[0] ?? null : null;

    const milestoneResult = contract
      ? await db
          .from("contract_milestones")
          .select(
            "contract_milestone_id,title,description,amount,display_order,due_date",
          )
          .eq("contract_id", contract.contract_id)
          .order("display_order", { ascending: true })
      : { data: [], error: null };
    const milestonesAvailable = !milestoneResult.error;

    const tasks = taskResult.data ?? [];
    const normalizedTaskStatus = (status: string) => status.toLowerCase();
    const taskProgress = taskResult.error ? null : {
      total: taskResult.count ?? tasks.length,
      completed: tasks.filter((task) =>
        ["complete", "completed", "done"].includes(
          normalizedTaskStatus(task.status),
        ),
      ).length,
      inProgress: tasks.filter((task) =>
        ["doing", "in_progress", "in progress"].includes(
          normalizedTaskStatus(task.status),
        ),
      ).length,
      overdue: tasks.filter(
        (task) =>
          task.due_date &&
          task.due_date < new Date().toISOString().slice(0, 10) &&
          !["complete", "completed", "done"].includes(
            normalizedTaskStatus(task.status),
          ),
      ).length,
    };

    return json({
      project: {
        id: project.project_id,
        title: project.title,
        description: project.description,
        status: String(project.status),
        budget: project.budget,
        projectType: project.project_type,
        startDate: project.start_date,
        dueDate: project.due_date,
        completedAt: project.completed_at,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        orderId: project.order_id,
        applicationId: project.application_id,
      },
      clientName: clientResult.data?.user_id
        ? nameByUserId.get(clientResult.data.user_id) ?? "Name unavailable"
        : "Name unavailable",
      freelancerName: freelancerResult.data?.user_id
        ? nameByUserId.get(freelancerResult.data.user_id) ?? "Name unavailable"
        : "Name unavailable",
      contract: contract
        ? {
            id: contract.contract_id,
            status: String(contract.status),
            finalPrice: contract.final_price,
            deliveryDays: contract.delivery_time_days,
            revisions: contract.revisions_count,
            createdAt: contract.created_at,
            updatedAt: contract.updated_at,
            clientSignedAt: contract.client_signed_at,
            freelancerSignedAt: contract.freelancer_signed_at,
            currentVersion: contract.current_version,
            clientSignedVersion: contract.client_signed_version,
            freelancerSignedVersion: contract.freelancer_signed_version,
          }
        : null,
      participantNamesAvailable:
        !clientResult.error && !freelancerResult.error && !profilesResult.error,
      contractAvailable,
      milestonesAvailable,
      milestones: (milestoneResult.data ?? []).map((milestone) => ({
        id: milestone.contract_milestone_id,
        title: milestone.title,
        description: milestone.description,
        amount: milestone.amount,
        dueDate: milestone.due_date,
      })),
      taskProgress,
    });
  } catch (error) {
    return paymentResponse(error);
  }
}
