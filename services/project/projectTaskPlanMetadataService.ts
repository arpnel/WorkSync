import { supabase } from "@/lib/supabaseClient";
import { databaseError } from "@/services/platform/platformService";

export type ContractTaskPlanMode = "legacy" | "versioned" | "unknown";

export interface ContractTaskPlanMetadata {
  mode: ContractTaskPlanMode;
  /** The workspace version supplied by the caller; null when it was not usable. */
  version: number | null;
  /** Latest immutable snapshot version observed by the lookup. */
  observedVersion: number | null;
  /** True when the snapshot version no longer matches the workspace version. */
  stale: boolean;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((item, index) => sameJsonValue(item, right[index]));
  }
  if (isObject(left) || isObject(right)) {
    if (!isObject(left) || !isObject(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) =>
      key === rightKeys[index] && sameJsonValue(left[key], right[key]),
    );
  }
  return false;
}

function hasVersionedPlanShape(value: unknown): boolean {
  if (!isObject(value) || typeof value.name !== "string" || !value.name.trim() ||
      typeof value.description !== "string" || !isObject(value.content)) return false;
  const columns = value.content.columns;
  if (!Array.isArray(columns) || columns.length < 2 || columns.length > 21) return false;
  let doneCount = 0;
  let taskCount = 0;
  const stageIds = new Set<string>();
  const taskIds = new Set<string>();
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    if (!isObject(column) || typeof column.id !== "string" || !column.id.trim() || column.id.length > 80 ||
        typeof column.name !== "string" || !column.name.trim() || column.name.trim().length > 80 ||
        (column.type !== "stage" && column.type !== "done") || !Array.isArray(column.tasks)) return false;
    if (stageIds.has(column.id)) return false;
    stageIds.add(column.id);
    if (column.type === "done") {
      doneCount += 1;
      if (index !== columns.length - 1 || column.tasks.length !== 0) return false;
    }
    for (const task of column.tasks) {
      if (!isObject(task) || typeof task.id !== "string" || !task.id.trim() || task.id.length > 80 ||
          typeof task.title !== "string" || !task.title.trim() || task.title.trim().length > 160 ||
          typeof task.description !== "string" || task.description.length > 1000 ||
          (task.priority !== "low" && task.priority !== "medium" && task.priority !== "high")) return false;
      if (taskIds.has(task.id) || stageIds.has(task.id)) return false;
      taskIds.add(task.id);
    }
    taskCount += column.tasks.length;
  }
  return doneCount === 1 && taskCount >= 1 && taskCount <= 120 &&
    [...stageIds].every((id) => !taskIds.has(id));
}

/**
 * Classifies one current-version metadata result. This is deliberately separate
 * from task-row loading and uses contracts.current_version to select the row.
 */
export function classifyContractTaskPlanMetadata(
  contractId: string | null,
  currentVersion: number | null,
  rows: unknown,
): ContractTaskPlanMode {
  if (!contractId || !Number.isInteger(currentVersion) || (currentVersion as number) < 1) return "unknown";
  if (!Array.isArray(rows) || rows.length !== 1 || !isObject(rows[0])) return "unknown";
  const row = rows[0];
  if (row.contract_id !== contractId || row.version !== currentVersion || !isObject(row.snapshot)) return "unknown";

  if (row.legacy === true) {
    return Object.prototype.hasOwnProperty.call(row.snapshot, "taskPlan") && row.snapshot.taskPlan === null
      ? "legacy"
      : "unknown";
  }
  if (row.legacy !== false) return "unknown";

  const terms = row.snapshot.terms;
  const taskPlan = row.snapshot.taskPlan;
  if (!isObject(terms) || terms.schemaVersion !== 1 || !hasVersionedPlanShape(terms.plan) ||
      !hasVersionedPlanShape(taskPlan) || !sameJsonValue(terms.plan, taskPlan)) return "unknown";
  return "versioned";
}

/**
 * Reads the latest immutable snapshot without rereading contracts.current_version.
 * The caller supplies the version observed in its workspace query. A mismatch
 * is returned as an explicit stale/unknown result instead of a current label.
 */
export async function loadContractTaskPlanMode(
  contractId: string | null,
  currentVersion: number | null,
): Promise<ContractTaskPlanMetadata> {
  const version = Number.isInteger(currentVersion) && (currentVersion as number) > 0 ? currentVersion : null;
  const unknown = (observedVersion: number | null = null, stale = false): ContractTaskPlanMetadata => ({
    mode: "unknown", version, observedVersion, stale,
  });
  if (!contractId || version === null) return unknown();
  const { data, error } = await supabase
    .from("contract_versions")
    .select("contract_id,version,snapshot,legacy")
    .eq("contract_id", contractId)
    .order("version", { ascending: false })
    .limit(1);
  if (error) throw databaseError(error);
  if (!Array.isArray(data) || data.length !== 1 || !isObject(data[0]) ||
      !Number.isInteger(data[0].version) || (data[0].version as number) < 1) return unknown();
  const observedVersion = data[0].version as number;
  if (observedVersion !== version) return unknown(observedVersion, true);
  return {
    mode: classifyContractTaskPlanMetadata(contractId, version, data),
    version,
    observedVersion,
    stale: false,
  };
}
