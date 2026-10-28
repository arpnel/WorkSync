import { supabase } from "@/lib/supabaseClient";
import { databaseError } from "@/services/platform/platformService";

export type PersistedProjectTaskStatus =
  | "todo"
  | "in_progress"
  | "in_review"
  | "revision_requested"
  | "auto_approved"
  | "completed";

export type ProjectTaskBoardStatus = "To Do" | "In Progress" | "Done";
export type ProjectTaskBoardPriority = "High" | "Medium" | "Low";
export type ProjectTaskPriority = "low" | "medium" | "high";
export interface ProjectTaskStatusDisplay {
  label: "To Do" | "In Progress" | "In Review" | "Revision Requested" | "Auto Approved" | "Completed";
  boardColumn: ProjectTaskBoardStatus;
}

/** Database task columns from the applied migration source, plus display-only mappings. */
export interface PersistedProjectTask {
  task_id: string;
  project_id: string;
  source_version: number;
  source_key: string;
  stage_id: string;
  stage_name: string;
  stage_order: number;
  title: string;
  description: string;
  priority: ProjectTaskPriority;
  milestone_id: string | null;
  due_date: string | null;
  status: PersistedProjectTaskStatus;
  statusDisplay: ProjectTaskStatusDisplay;
  display_order: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  boardStatus: ProjectTaskBoardStatus;
  boardPriority: ProjectTaskBoardPriority;
}

export class ProjectTaskDataError extends Error {
  constructor(message: string) {
    super(`Invalid project task data: ${message}`);
    this.name = "ProjectTaskDataError";
  }
}

const TASK_SELECT =
  "task_id,project_id,source_version,source_key,stage_id,stage_name,stage_order,title,description,priority,milestone_id,due_date,status,display_order,completed_at,created_at,updated_at";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TASK_STATUS_DISPLAY: Record<PersistedProjectTaskStatus, ProjectTaskStatusDisplay> = {
  todo: { label: "To Do", boardColumn: "To Do" },
  in_progress: { label: "In Progress", boardColumn: "In Progress" },
  in_review: { label: "In Review", boardColumn: "In Progress" },
  revision_requested: { label: "Revision Requested", boardColumn: "In Progress" },
  auto_approved: { label: "Auto Approved", boardColumn: "In Progress" },
  completed: { label: "Completed", boardColumn: "Done" },
};

/** Display-only mapping; the raw database status remains authoritative and unchanged. */
export function projectTaskStatusDisplay(status: string): ProjectTaskStatusDisplay {
  if (!Object.prototype.hasOwnProperty.call(TASK_STATUS_DISPLAY, status)) {
    throw new ProjectTaskDataError(`status '${status}' is not a task status defined by the migration.`);
  }
  return TASK_STATUS_DISPLAY[status as PersistedProjectTaskStatus];
}

function taskBoardPriority(priority: ProjectTaskPriority): ProjectTaskBoardPriority {
  return priority === "high" ? "High" : priority === "medium" ? "Medium" : "Low";
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year > 0 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapTaskRow(value: unknown, index: number, requestedProjectId: string): PersistedProjectTask {
  const prefix = `row ${index}`;
  if (!isRecord(value)) throw new ProjectTaskDataError(`${prefix} must be an object.`);
  const row = value;
  for (const field of ["task_id", "project_id", "milestone_id"] as const) {
    const id = row[field];
    if ((field === "milestone_id" && id === null) || (field !== "milestone_id" && typeof id === "string" && UUID_PATTERN.test(id))) continue;
    if (field === "milestone_id" && typeof id === "string" && UUID_PATTERN.test(id)) continue;
    throw new ProjectTaskDataError(`${prefix}.${field} must be ${field === "milestone_id" ? "null or a UUID" : "a UUID"}.`);
  }
  if (row.project_id !== requestedProjectId) throw new ProjectTaskDataError(`${prefix}.project_id does not match the requested project.`);
  for (const field of ["source_key", "stage_id", "stage_name", "title", "description"] as const) {
    if (typeof row[field] !== "string") throw new ProjectTaskDataError(`${prefix}.${field} must be a string.`);
  }
  if (!row.source_key || !row.stage_id || !(row.stage_name as string).trim() || !(row.title as string).trim()) {
    throw new ProjectTaskDataError(`${prefix} is missing a required source, stage, or title value.`);
  }
  if ((row.title as string).trim().length > 160 || (row.description as string).length > 1000) {
    throw new ProjectTaskDataError(`${prefix} title or description exceeds the schema limit.`);
  }
  if (!Number.isInteger(row.source_version) || (row.source_version as number) < 1) {
    throw new ProjectTaskDataError(`${prefix}.source_version must be a positive integer.`);
  }
  for (const field of ["stage_order", "display_order"] as const) {
    if (!Number.isInteger(row[field]) || (row[field] as number) < 1) {
      throw new ProjectTaskDataError(`${prefix}.${field} must be a positive integer.`);
    }
  }
  if (row.priority !== "low" && row.priority !== "medium" && row.priority !== "high") {
    throw new ProjectTaskDataError(`${prefix}.priority is not a supported task priority.`);
  }
  if (typeof row.status !== "string") throw new ProjectTaskDataError(`${prefix}.status must be a string.`);
  let statusDisplay: ProjectTaskStatusDisplay;
  try {
    statusDisplay = projectTaskStatusDisplay(row.status);
  } catch {
    throw new ProjectTaskDataError(`${prefix}.status is not a supported task status.`);
  }
  if (row.due_date !== null && !isDate(row.due_date)) {
    throw new ProjectTaskDataError(`${prefix}.due_date must be null or a valid date.`);
  }
  if (row.completed_at !== null && !isTimestamp(row.completed_at)) {
    throw new ProjectTaskDataError(`${prefix}.completed_at must be null or a valid timestamp.`);
  }
  if (!isTimestamp(row.created_at) || !isTimestamp(row.updated_at)) {
    throw new ProjectTaskDataError(`${prefix}.created_at and updated_at must be valid timestamps.`);
  }

  const status = row.status as PersistedProjectTaskStatus;
  const priority = row.priority as ProjectTaskPriority;
  return {
    task_id: row.task_id as string,
    project_id: row.project_id as string,
    source_version: row.source_version as number,
    source_key: row.source_key as string,
    stage_id: row.stage_id as string,
    stage_name: row.stage_name as string,
    stage_order: row.stage_order as number,
    title: row.title as string,
    description: row.description as string,
    priority,
    milestone_id: row.milestone_id as string | null,
    due_date: row.due_date as string | null,
    status,
    statusDisplay,
    display_order: row.display_order as number,
    completed_at: row.completed_at as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    boardStatus: statusDisplay.boardColumn,
    boardPriority: taskBoardPriority(priority),
  };
}

/** Strictly maps and deterministically orders rows; malformed rows fail the whole read. */
export function mapProjectTaskRows(rows: unknown, projectId: string): PersistedProjectTask[] {
  if (!UUID_PATTERN.test(projectId)) throw new ProjectTaskDataError("projectId must be a UUID.");
  if (!Array.isArray(rows)) throw new ProjectTaskDataError("query result must be an array; use [] for an empty result.");
  return rows
    .map((row, index) => mapTaskRow(row, index, projectId))
    .sort((left, right) =>
      left.stage_order - right.stage_order ||
      left.display_order - right.display_order ||
      left.task_id.localeCompare(right.task_id),
    );
}

/**
 * Reads tasks for one project through the existing authenticated Supabase client.
 * Participant visibility relies on the applied migration's SELECT grant and RLS
 * policy; deployed grants and policy behavior have not been verified here.
 */
export async function loadProjectTasks(projectId: string): Promise<PersistedProjectTask[]> {
  if (!UUID_PATTERN.test(projectId)) throw new ProjectTaskDataError("projectId must be a UUID.");
  const { data, error } = await supabase
    .from("project_tasks")
    .select(TASK_SELECT)
    .eq("project_id", projectId)
    .order("stage_order", { ascending: true })
    .order("display_order", { ascending: true })
    .order("task_id", { ascending: true });
  if (error) throw databaseError(error);
  return mapProjectTaskRows(data, projectId);
}
