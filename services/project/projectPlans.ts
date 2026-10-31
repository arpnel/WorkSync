import { supabase } from "@/lib/supabaseClient";

export type PlanTask = {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  expectedDays?: number;
};
export type PlanColumn = {
  id: string;
  name: string;
  type: "stage" | "done";
  tasks: PlanTask[];
  pinned?: boolean;
};
export type PlanContent = { columns: PlanColumn[] };
export type ProjectPlanSnapshot = {
  name: string;
  description: string;
  content: PlanContent;
};
export type ProjectPlan = {
  plan_id: string;
  owner_id: string;
  name: string;
  description: string;
  content: { columns: PlanColumn[] };
  created_at: string;
  updated_at: string;
  shared?: boolean;
};

/** Repairs legacy or stale plan order while preserving stage/task contents. */
export function normalizePlanContent(
  content: unknown,
  ensureDone = false,
): PlanContent {
  const rawColumns =
    content && typeof content === "object" && "columns" in content
      ? (content as { columns?: unknown }).columns
      : undefined;
  const columns: PlanColumn[] = Array.isArray(rawColumns)
    ? rawColumns.map((raw, index) => {
        const column =
          raw && typeof raw === "object"
            ? (raw as Record<string, unknown>)
            : {};
        return {
          ...column,
          id: typeof column.id === "string" ? column.id : `stage-${index + 1}`,
          name:
            typeof column.name === "string" && column.name.trim()
              ? column.name
              : `Stage ${index + 1}`,
          type:
            typeof column.type === "string" &&
            column.type.toLowerCase() === "done"
              ? "done"
              : "stage",
          tasks: Array.isArray(column.tasks)
            ? (column.tasks as PlanTask[])
            : [],
        };
      })
    : [];

  let doneIndex = -1;
  columns.forEach((column, index) => {
    if (column.type === "done") doneIndex = index;
  });
  if (doneIndex < 0) {
    if (Array.isArray(rawColumns)) {
      rawColumns.forEach((rawColumn, index) => {
        const rawType =
          rawColumn && typeof rawColumn === "object"
            ? (rawColumn as Record<string, unknown>).type
            : undefined;
        if (
          rawType == null &&
          columns[index]?.name.trim().toLowerCase() === "done"
        ) {
          doneIndex = index;
        }
      });
    }
  }

  const stages = columns
    .filter((_, index) => index !== doneIndex)
    .map((column) => ({ ...column, type: "stage" as const }));
  if (doneIndex < 0 && !ensureDone) return { columns: stages };
  const done =
    doneIndex >= 0
      ? { ...columns[doneIndex], type: "done" as const }
      : {
          id: `done-${crypto.randomUUID()}`,
          name: "Done",
          type: "done" as const,
          tasks: [],
        };
  return { columns: [...stages, done] };
}

export function reorderPlanStage(
  content: unknown,
  stageId: string,
  destinationIndex: number,
  ensureDone = false,
): PlanContent {
  const normalized = normalizePlanContent(content, ensureDone);
  const done = normalized.columns.find((column) => column.type === "done");
  const stages = normalized.columns.filter((column) => column.type !== "done");
  const sourceIndex = stages.findIndex((column) => column.id === stageId);
  if (sourceIndex < 0) return normalized;
  const [stage] = stages.splice(sourceIndex, 1);
  stages.splice(
    Math.max(0, Math.min(destinationIndex, stages.length)),
    0,
    stage,
  );
  return { columns: done ? [...stages, done] : stages };
}

export function dropPlanStageBefore(
  content: unknown,
  stageId: string,
  targetStageId: string,
  ensureDone = false,
): PlanContent {
  const normalized = normalizePlanContent(content, ensureDone);
  const stages = normalized.columns.filter((column) => column.type !== "done");
  const sourceIndex = stages.findIndex((column) => column.id === stageId);
  const target = normalized.columns.find(
    (column) => column.id === targetStageId,
  );
  if (sourceIndex < 0 || !target) return normalized;
  let destination =
    target.type === "done"
      ? stages.length
      : stages.findIndex((column) => column.id === targetStageId);
  if (target.type !== "done" && sourceIndex < destination) destination -= 1;
  return reorderPlanStage(normalized, stageId, destination, ensureDone);
}

export async function listProjectPlans(ensureDone = false) {
  const { data, error } = await supabase
    .from("project_plans")
    .select("*, project_plan_shares(recipient_id)")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    content: normalizePlanContent(row.content, ensureDone),
    shared: (row.project_plan_shares?.length ?? 0) > 0,
  })) as ProjectPlan[];
}

export async function saveProjectPlan(
  plan:
    | Pick<ProjectPlan, "plan_id" | "name" | "description" | "content">
    | Omit<
        ProjectPlan,
        "plan_id" | "owner_id" | "created_at" | "updated_at" | "shared"
      >,
  ownerId: string,
  ensureDone = false,
) {
  const values = {
    owner_id: ownerId,
    name: plan.name.trim(),
    description: plan.description.trim(),
    content: normalizePlanContent(plan.content, ensureDone),
    updated_at: new Date().toISOString(),
  };
  const query =
    "plan_id" in plan && plan.plan_id
      ? supabase
          .from("project_plans")
          .update(values)
          .eq("plan_id", plan.plan_id)
          .select("*")
          .single()
      : supabase.from("project_plans").insert(values).select("*").single();
  const { data, error } = await query;
  if (error) throw error;
  return data as ProjectPlan;
}

export async function removeProjectPlan(planId: string) {
  const { error } = await supabase
    .from("project_plans")
    .delete()
    .eq("plan_id", planId);
  if (error) throw error;
}

export async function shareProjectPlan(
  planId: string,
  ownerId: string,
  recipientId: string,
) {
  const { error } = await supabase
    .from("project_plan_shares")
    .insert({ plan_id: planId, owner_id: ownerId, recipient_id: recipientId });
  if (error) throw error;
}

export async function unshareProjectPlan(planId: string, recipientId: string) {
  const { error } = await supabase
    .from("project_plan_shares")
    .delete()
    .eq("plan_id", planId)
    .eq("recipient_id", recipientId);
  if (error) throw error;
}
