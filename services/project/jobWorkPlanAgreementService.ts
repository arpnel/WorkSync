import { supabase } from "@/lib/supabaseClient";
import {
  projectPlanSnapshotSchema,
  type ProjectPlanSnapshotData,
} from "@/services/project/projectPlanSnapshot";

export interface JobWorkPlanAgreement {
  plan: ProjectPlanSnapshotData | null;
  previousPlan: ProjectPlanSnapshotData | null;
  changedBy: "client" | "freelancer" | null;
  clientAgreed: boolean;
  freelancerAgreed: boolean;
  hasPlanAgreement: boolean;
}

function explainError(error: { code?: string; message: string }): Error {
  if (error.code === "PGRST202" || /Could not find the function .*schema cache/i.test(error.message)) {
    return new Error(
      "The work plan agreement database change is not installed. Apply supabase/proposed_migrations/worksync_job_work_plan_agreement.sql after the basic terms agreement migration, then reload the Supabase API schema cache.",
    );
  }
  return new Error(error.message);
}

function parsePlan(value: unknown): ProjectPlanSnapshotData | null {
  if (value == null) return null;
  const normalized = normalizeOptionalTaskFields(value);
  const parsed = projectPlanSnapshotSchema.safeParse(normalized);
  if (!parsed.success) throw new Error("The saved work plan could not be read.");
  return parsed.data;
}

function normalizeOptionalTaskFields(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const plan = value as Record<string, unknown>;
  const content = plan.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) return value;
  const columns = (content as Record<string, unknown>).columns;
  if (!Array.isArray(columns)) return value;
  return {
    ...plan,
    content: {
      ...(content as Record<string, unknown>),
      columns: columns.map((column) => {
        if (!column || typeof column !== "object" || Array.isArray(column)) return column;
        const record = column as Record<string, unknown>;
        if (!Array.isArray(record.tasks)) return column;
        return {
          ...record,
          tasks: record.tasks.map((task) => {
            if (!task || typeof task !== "object" || Array.isArray(task)) return task;
            const item = { ...(task as Record<string, unknown>) };
            for (const field of ["expectedDays", "dueDate", "milestoneId"])
              if (item[field] === null) delete item[field];
            return item;
          }),
        };
      }),
    },
  };
}

function parseAgreement(value: unknown): JobWorkPlanAgreement {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("The work plan agreement response was invalid.");
  const result = value as Record<string, unknown>;
  return {
    plan: parsePlan(result.plan),
    previousPlan: parsePlan(result.previousPlan),
    changedBy:
      result.changedBy === "client" || result.changedBy === "freelancer"
        ? result.changedBy
        : null,
    clientAgreed: result.clientAgreed === true,
    freelancerAgreed: result.freelancerAgreed === true,
    hasPlanAgreement: result.hasPlanAgreement === true,
  };
}

export async function getJobWorkPlanAgreement(
  applicationId: string,
): Promise<JobWorkPlanAgreement> {
  const { data, error } = await supabase.rpc(
    "worksync_get_job_work_plan_agreement",
    { p_application: applicationId },
  );
  if (error) throw explainError(error);
  return parseAgreement(data);
}

export async function agreeToJobWorkPlan(
  applicationId: string,
  plan: ProjectPlanSnapshotData,
): Promise<JobWorkPlanAgreement> {
  const validatedPlan = projectPlanSnapshotSchema.safeParse(normalizeOptionalTaskFields(plan));
  if (!validatedPlan.success)
    throw new Error(validatedPlan.error.issues[0]?.message ?? "Check the work plan details.");
  const { data, error } = await supabase.rpc(
    "worksync_agree_job_work_plan",
    { p_application: applicationId, p_plan: validatedPlan.data },
  );
  if (error) throw explainError(error);
  return parseAgreement(data);
}
