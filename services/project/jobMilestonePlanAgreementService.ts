import { supabase } from "@/lib/supabaseClient";
import type { ContractVersionMilestoneInput } from "@/services/project/projectWorkspaceService";

export interface JobMilestonePlanAgreement {
  milestones: ContractVersionMilestoneInput[];
  clientAgreed: boolean;
  freelancerAgreed: boolean;
}

function explainError(error: { code?: string; message: string }): Error {
  if (error.code === "PGRST202" || /Could not find the function .*schema cache/i.test(error.message)) {
    return new Error("The milestone agreement database change is not installed. Apply supabase/proposed_migrations/worksync_job_milestone_plan_agreement.sql, then reload the Supabase API schema cache.");
  }
  return new Error(error.message);
}

function parse(value: unknown): JobMilestonePlanAgreement {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The milestone plan agreement response was invalid.");
  }
  const result = value as Record<string, unknown>;
  if (!Array.isArray(result.milestones)) throw new Error("The agreed milestone plan could not be read.");
  const milestones = result.milestones.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Milestone ${index + 1} is invalid.`);
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.title !== "string" || typeof row.description !== "string" || typeof row.amount !== "number" || !(typeof row.dueDate === "string" || row.dueDate === null) || typeof row.displayOrder !== "number") {
      throw new Error(`Milestone ${index + 1} is invalid.`);
    }
    const taskIds = row.taskIds === undefined ? [] : row.taskIds;
    if (!Array.isArray(taskIds) || taskIds.some((taskId) => typeof taskId !== "string")) {
      throw new Error(`Milestone ${index + 1} task assignments are invalid.`);
    }
    return { id: row.id, title: row.title, description: row.description, amount: row.amount, dueDate: row.dueDate, displayOrder: row.displayOrder, taskIds };
  });
  return { milestones, clientAgreed: result.clientAgreed === true, freelancerAgreed: result.freelancerAgreed === true };
}

export async function getJobMilestonePlanAgreement(applicationId: string): Promise<JobMilestonePlanAgreement> {
  const { data, error } = await supabase.rpc("worksync_get_job_milestone_plan_agreement", { p_application: applicationId });
  if (error) throw explainError(error);
  return parse(data);
}

export async function agreeToJobMilestonePlan(
  applicationId: string,
  milestones: readonly ContractVersionMilestoneInput[],
): Promise<JobMilestonePlanAgreement> {
  const { data, error } = await supabase.rpc("worksync_agree_job_milestone_plan", {
    p_application: applicationId,
    p_milestones: milestones.map(({ id, title, description, amount, dueDate, displayOrder, taskIds }) => ({ id, title, description, amount, dueDate, displayOrder, taskIds: taskIds ?? [] })),
  });
  if (error) throw explainError(error);
  return parse(data);
}
