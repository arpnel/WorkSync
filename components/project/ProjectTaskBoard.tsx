"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  FileText,
  GripVertical,
  MessageSquare,
  Plus,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StyledSelect } from "@/components/ui/styled-select";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";
import { completeProjectTask, ensureServiceOrderPlanTasks, ensureSubmittedPlanTasks, loadProjectTasks, startProjectTask, type PersistedProjectTask } from "@/services/project/projectTaskService";
import { loadContractTaskPlanMode } from "@/services/project/projectTaskPlanMetadataService";
import {
  addProjectTaskComment,
  loadProjectTaskComments,
  subscribeToProjectTaskComments,
  type ProjectTaskComment as StoredProjectTaskComment,
} from "@/services/project/projectTaskCommentService";
import {
  loadProjectTaskAttachments,
  openProjectTaskAttachment,
  subscribeToProjectTaskAttachments,
  uploadProjectTaskAttachment,
  PROJECT_TASK_ATTACHMENT_MAX_BYTES,
  type ProjectTaskAttachment,
} from "@/services/project/projectTaskAttachmentService";
import { notifyProjectActivityChanged } from "@/lib/projectRealtime";

type TaskStatus = "To Do" | "In Progress" | "Done";
type Priority = "High" | "Medium" | "Low";
type TaskComment = { id: string; authorId: string; author: string; message: string; createdAt: string };
type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: string;
  deadlineAt?: string;
  priority: Priority;
  comments: TaskComment[];
  attachments: ProjectTaskAttachment[];
  milestoneId: string | null;
  workScope: boolean;
  sourceKey?: string;
  sourceStageName?: string;
  expectedDays?: number;
  persistedStatus?: PersistedProjectTask["status"];
  persistedStatusLabel?: string;
  persisted?: boolean;
};
const completedColumns: TaskStatus[] = ["To Do", "In Progress", "Done"];

export type TaskBoardLoadStatus = "loading" | "legacy" | "versioned" | "empty" | "unknown" | "error";
export interface TaskBoardLoadState {
  key: string;
  status: TaskBoardLoadStatus;
  tasks: Task[];
  message?: string;
}

export function loadingTaskBoardState(key: string): TaskBoardLoadState {
  return { key, status: "loading", tasks: [] };
}

function workspaceTaskKey(project: ProjectWorkspace): string {
  return `${project.projectId ?? "no-project"}:${project.contractId ?? "no-contract"}:${project.contractVersion ?? "no-version"}`;
}

function legacyTaskFallback(project: ProjectWorkspace): Task[] {
  const submittedPlanTasks = project.proposedPlan?.content.columns.flatMap((column) =>
    column.type === "done" ? [] : column.tasks.map((task) => ({
      id: `submitted-${column.id}-${task.id}`,
      title: task.title,
      description: task.description,
      status: "To Do" as TaskStatus,
      dueDate: "",
      priority: task.priority === "high" ? "High" as Priority : task.priority === "medium" ? "Medium" as Priority : "Low" as Priority,
      comments: [],
      attachments: [],
      milestoneId: null,
      workScope: true,
      sourceStageName: column.name,
      sourceKey: project.applicationId ? `${column.id}:${task.id}` : task.id,
      expectedDays: task.expectedDays,
    })),
  ) ?? [];
  if (submittedPlanTasks.length) return submittedPlanTasks;

  return project.type === "milestone"
    ? []
    : [{ id: "project-work", title: "Project delivery", description: project.description || "Submit the agreed project work and review client feedback.", status: project.status.toLowerCase() === "completed" ? "Done" : "In Progress", dueDate: project.dueDate?.slice(0, 10) ?? "", priority: "High", comments: [], attachments: [], milestoneId: null, workScope: true }];
}

export function mapPersistedTasksToBoard(tasks: readonly PersistedProjectTask[]): Task[] {
  return tasks.map((task) => ({
    id: task.task_id,
    title: task.title,
    description: task.description,
    status: task.boardStatus,
    dueDate: task.due_date ?? "",
    priority: task.boardPriority,
    comments: [],
    attachments: [],
    milestoneId: task.milestone_id,
    workScope: true,
    sourceKey: task.source_key,
    expectedDays: task.expected_days ?? undefined,
    deadlineAt: task.deadline_at ?? undefined,
    persistedStatus: task.status,
    persistedStatusLabel: task.statusDisplay.label,
    persisted: true,
  }));
}

function mergeSavedTaskProgress(
  planTasks: readonly Task[],
  persistedTasks: readonly PersistedProjectTask[],
): Task[] {
  const savedByKey = new Map(persistedTasks.map((task) => [task.source_key, task]));
  return planTasks.map((task) => {
    const saved = task.sourceKey ? savedByKey.get(task.sourceKey) : undefined;
    if (!saved) return task;
    return {
      ...task,
      id: saved.task_id,
      status: saved.boardStatus,
      dueDate: saved.due_date ?? task.dueDate,
      deadlineAt: saved.deadline_at ?? undefined,
      persistedStatus: saved.status,
      persistedStatusLabel: saved.statusDisplay.label,
      persisted: true,
    };
  });
}

export function isCurrentTaskBoardResponse(
  responseKey: string,
  currentKey: string,
  responseSequence: number,
  currentSequence: number,
): boolean {
  return responseKey === currentKey && responseSequence === currentSequence;
}

export async function loadProjectTaskBoardData(project: ProjectWorkspace): Promise<Omit<TaskBoardLoadState, "key">> {
  try {
    // Direct service orders save the agreed freelancer plan separately from
    // the payment milestone schedule. Seed the full task workflow independently
    // so unassigned plan tasks are not lost or mistaken for payment milestones.
    if (!project.applicationId && project.projectId && project.proposedPlan) {
      const planTasks = legacyTaskFallback(project);
      const expectedTaskCount = planTasks.length;
      if (project.currentParty === "freelancer") {
        try {
          const savedTasks = await ensureServiceOrderPlanTasks(project.projectId);
          return savedTasks.length
            ? { status: "versioned", tasks: mapPersistedTasksToBoard(savedTasks) }
            : { status: "empty", tasks: [], message: "The agreed project plan has no tasks to show." };
        } catch (cause) {
          return {
            status: planTasks.length ? "legacy" : "empty",
            tasks: planTasks,
            message: cause instanceof Error ? cause.message : "The agreed task plan could not be saved.",
          };
        }
      }
      const existingTasks = await loadProjectTasks(project.projectId);
      if (existingTasks.length >= expectedTaskCount && expectedTaskCount > 0) {
        return { status: "versioned", tasks: mapPersistedTasksToBoard(existingTasks) };
      }
      return {
        status: planTasks.length ? "legacy" : "empty",
        tasks: mergeSavedTaskProgress(planTasks, existingTasks),
        message: planTasks.length ? undefined : "The agreed project plan has no tasks to show.",
      };
    }

    const metadata = await loadContractTaskPlanMode(project.contractId, project.contractVersion);
    if (metadata.mode === "legacy") {
      if (project.projectId) {
        const existingTasks = await loadProjectTasks(project.projectId);
        if (existingTasks.length) return { status: "versioned", tasks: mapPersistedTasksToBoard(existingTasks) };
      }
      const tasks = legacyTaskFallback(project);
      return tasks.length
        ? { status: "legacy", tasks }
        : { status: "empty", tasks, message: "No agreed project plan tasks are available. Payment milestones are shown separately and do not replace the freelancer's task board." };
    }
    if (metadata.mode !== "versioned" || metadata.stale) {
      return {
        status: "unknown",
        tasks: [],
        message: metadata.stale
          ? "The contract version changed while loading. Refresh the workspace to see the current task plan."
          : "The current contract task plan could not be confirmed. Refresh the workspace before continuing.",
      };
    }
    if (metadata.version !== project.contractVersion || !metadata.version) {
      return { status: "unknown", tasks: [], message: "The contract version changed while loading. Refresh the workspace to see the current task plan." };
    }
    if (!project.projectId) return { status: "error", tasks: [], message: "The versioned task plan has no active project to load." };
    const persistedTasks = await loadProjectTasks(project.projectId);
    const tasks = mapPersistedTasksToBoard(persistedTasks);
    return { status: tasks.length ? "versioned" : "empty", tasks };
  } catch (cause) {
    return {
      status: "error",
      tasks: [],
      message: cause instanceof Error ? cause.message : "Unable to load the project task plan.",
    };
  }
}

export function ProjectTaskBoard({
  project,
  actions,
  compact = false,
}: {
  project: ProjectWorkspace;
  actions?: ReactNode;
  compact?: boolean;
}) {
  const [taskLoad, setTaskLoad] = useState<TaskBoardLoadState>(() => loadingTaskBoardState(""));
  const [selection, setSelection] = useState<{ key: string; id: string } | null>(null);
  const [commentLoadError, setCommentLoadError] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [attachmentSaving, setAttachmentSaving] = useState(false);
  const loadSequence = useRef(0);
  const projectRef = useRef(project);
  projectRef.current = project;
  const taskKey = workspaceTaskKey(project);
  const columns = completedColumns;
  const reloadTasks = useCallback(async () => {
    const sequence = ++loadSequence.current;
    const currentProject = projectRef.current;
    const key = workspaceTaskKey(currentProject);
    setTaskLoad(loadingTaskBoardState(key));
    const result = await loadProjectTaskBoardData(currentProject);
    if (!isCurrentTaskBoardResponse(key, taskKey, sequence, loadSequence.current)) return;
    setTaskLoad({ key, ...result });
  }, [taskKey]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void reloadTasks(); });
    return () => { cancelled = true; loadSequence.current += 1; };
  }, [reloadTasks]);

  const visibleLoad = taskLoad.key === taskKey
    ? taskLoad
    : loadingTaskBoardState(taskKey);
  const tasks = visibleLoad.tasks;
  const selected = selection?.key === taskKey
    ? tasks.find((task) => task.id === selection.id) ?? null
    : null;
  const selectedComments = selected?.comments ?? [];
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [comment, setComment] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const [taskActionError, setTaskActionError] = useState("");
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);

  const selectedCommentKey = selected?.sourceKey ?? (selected?.persisted || selected?.workScope ? selected.id : undefined);
  useEffect(() => {
    if (!selected || !project.projectId || !selectedCommentKey) return;
    let cancelled = false;
    const refreshComments = async () => {
      try {
        const stored = await loadProjectTaskComments(project.projectId!, selectedCommentKey);
        if (!cancelled) {
          setCommentLoadError("");
          updateTaskComments(selected.id, selectedCommentKey, stored);
        }
      } catch (cause) {
        if (!cancelled) setCommentLoadError(cause instanceof Error ? cause.message : "Comments could not be loaded.");
      }
    };
    const refreshAttachments = async () => {
      try {
        const stored = await loadProjectTaskAttachments(project.projectId!, selectedCommentKey);
        if (!cancelled) {
          setAttachmentError("");
          updateTaskAttachments(selected.id, selectedCommentKey, stored);
        }
      } catch (cause) {
        if (!cancelled) setAttachmentError(cause instanceof Error ? cause.message : "Attachments could not be loaded.");
      }
    };
    void refreshComments();
    void refreshAttachments();
    const unsubscribe = subscribeToProjectTaskComments(project.projectId, selectedCommentKey, () => void refreshComments());
    const unsubscribeAttachments = subscribeToProjectTaskAttachments(project.projectId, selectedCommentKey, () => void refreshAttachments());
    return () => { cancelled = true; unsubscribe(); unsubscribeAttachments(); };
  // The effect tracks the selected task identity and its stable database key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.projectId, selected?.id, selectedCommentKey]);

  function mapStoredComment(entry: StoredProjectTaskComment): TaskComment {
    const isCurrentUser = entry.author_id === project.currentUserId;
    const author = isCurrentUser
      ? (project.currentParty === "client" ? project.clientName : project.freelancerName)
      : (project.currentParty === "client" ? project.freelancerName : project.clientName);
    return { id: entry.comment_id, authorId: entry.author_id, author, message: entry.body, createdAt: entry.created_at };
  }

  function updateTaskComments(taskId: string, commentKey: string, stored: StoredProjectTaskComment[]) {
    const comments = stored.map(mapStoredComment);
    setTaskLoad((current) => current.key === taskKey
      ? { ...current, tasks: current.tasks.map((task) => task.id === taskId || task.sourceKey === commentKey ? { ...task, comments } : task) }
      : current);
  }

  function appendTaskComment(taskId: string, commentKey: string, stored: StoredProjectTaskComment) {
    const next = mapStoredComment(stored);
    setTaskLoad((current) => current.key === taskKey
      ? { ...current, tasks: current.tasks.map((task) => task.id === taskId || task.sourceKey === commentKey
        ? { ...task, comments: [...task.comments.filter((entry) => entry.id !== next.id), next] }
        : task) }
      : current);
  }

  function updateTaskAttachments(taskId: string, commentKey: string, attachments: ProjectTaskAttachment[]) {
    setTaskLoad((current) => current.key === taskKey
      ? { ...current, tasks: current.tasks.map((task) => task.id === taskId || task.sourceKey === commentKey ? { ...task, attachments } : task) }
      : current);
  }

  function appendTaskAttachment(taskId: string, commentKey: string, attachment: ProjectTaskAttachment) {
    setTaskLoad((current) => current.key === taskKey
      ? { ...current, tasks: current.tasks.map((task) => task.id === taskId || task.sourceKey === commentKey
        ? { ...task, attachments: [...task.attachments.filter((entry) => entry.attachment_id !== attachment.attachment_id), attachment] }
        : task) }
      : current);
  }

  function updateSelected(patch: Partial<Task>) {
    if (!selected) return;
    setTaskLoad((current) => current.key === taskKey
      ? { ...current, tasks: current.tasks.map((task) => task.id === selected.id ? { ...task, ...patch } : task) }
      : current);
  }

  function canMoveTask(task: Task): boolean {
    return task.persisted || (visibleLoad.status === "legacy" && Boolean(project.proposedPlan && project.projectId && task.sourceKey));
  }

  async function moveTask(taskId: string, status: TaskStatus) {
    if (project.currentParty !== "freelancer") return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === status || savingTaskId) return;
    const starting = task.status === "To Do" && status === "In Progress";
    const completing = task.status === "In Progress" &&
      task.persistedStatus === "in_progress" && status === "Done";
    if (!starting && !completing) return;
    setTaskActionError("");
    setSavingTaskId(taskId);
    try {
      let taskDatabaseId = task.id;
      let seededTasks: PersistedProjectTask[] | null = null;
      if (starting && !task.persisted) {
        if (!canMoveTask(task) || !project.projectId || !task.sourceKey) {
          throw new Error("This task is not linked to a saved project plan.");
        }
        seededTasks = project.applicationId
          ? await ensureSubmittedPlanTasks(project.projectId)
          : await ensureServiceOrderPlanTasks(project.projectId);
        const seededTarget = seededTasks.find((item) => item.source_key === task.sourceKey);
        if (!seededTarget) throw new Error("Could not match this task to the freelancer’s saved application plan.");
        taskDatabaseId = seededTarget.task_id;
      }
      const saved = completing
        ? await completeProjectTask(taskDatabaseId)
        : await startProjectTask(taskDatabaseId, Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
      if (project.projectId) notifyProjectActivityChanged(project.projectId);
      if (seededTasks && selection?.id === taskId) setSelection({ key: taskKey, id: taskDatabaseId });
      setTaskLoad((current) => current.key === taskKey
        ? { ...current, status: "versioned", tasks: (seededTasks ? mapPersistedTasksToBoard(seededTasks) : current.tasks).map((item) => item.id === taskDatabaseId ? {
          ...item,
          status: saved.boardStatus,
          persistedStatus: saved.status,
          persistedStatusLabel: saved.statusDisplay.label,
          deadlineAt: saved.deadline_at ?? undefined,
          dueDate: saved.due_date ?? "",
        } : item) }
        : current);
    } catch (cause) {
      setTaskActionError(cause instanceof Error ? cause.message : "Task progress could not be saved. Refresh and try again.");
    } finally {
      setSavingTaskId(null);
    }
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = newTitle.trim();
    if (!cleanTitle) return;
    const task: Task = { id: crypto.randomUUID(), title: cleanTitle, description: newDescription.trim(), status: "To Do", dueDate: "", priority: "Medium", comments: [], attachments: [], milestoneId: null, workScope: false };
    setTaskLoad((current) => current.key === taskKey
      ? { ...current, status: "legacy", tasks: [...current.tasks, task] }
      : current);
    setNewTitle("");
    setNewDescription("");
    setAdding(false);
    setSelection({ key: taskKey, id: task.id });
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !project.projectId || !selectedCommentKey || !comment.trim() || commentSaving) return;
    setCommentLoadError("");
    setCommentSaving(true);
    try {
      const saved = await addProjectTaskComment(project.projectId, selectedCommentKey, comment);
      appendTaskComment(selected.id, selectedCommentKey, saved);
      setComment("");
    } catch (cause) {
      setCommentLoadError(cause instanceof Error ? cause.message : "Comment could not be sent. Try again.");
    } finally {
      setCommentSaving(false);
    }
  }

  async function addAttachment(file: File) {
    if (!selected || project.currentParty !== "freelancer") return;
    setAttachmentError("");
    if (!project.projectId || !selectedCommentKey) {
      setAttachmentError("Attach this task to a saved project plan before adding shared files.");
      return;
    }
    if (attachmentSaving) return;
    setAttachmentSaving(true);
    try {
      const attachment = await uploadProjectTaskAttachment(project.projectId, selectedCommentKey, file);
      appendTaskAttachment(selected.id, selectedCommentKey, attachment);
    } catch (cause) {
      setAttachmentError(cause instanceof Error ? cause.message : "The file could not be attached.");
    } finally {
      setAttachmentSaving(false);
    }
  }

  async function downloadAttachment(attachment: ProjectTaskAttachment) {
    try {
      await openProjectTaskAttachment(attachment.storage_path);
    } catch (cause) {
      setAttachmentError(cause instanceof Error ? cause.message : "The file could not be opened.");
    }
  }

  return (
    <section aria-label="Project task board" className={compact ? "space-y-3" : "space-y-4 rounded-xl border bg-card p-4 sm:p-5"}>
      {!compact && <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Project work</h2>
          <p className="mt-1 text-sm text-muted-foreground">Plan tasks, track progress, and open a card for its details and project delivery.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}{visibleLoad.status === "legacy" && <Button size="sm" onClick={() => setAdding((open) => !open)}><Plus className="mr-1.5 h-4 w-4" />Add task</Button>}</div>
      </div>

      <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">{visibleLoad.status === "versioned" || visibleLoad.status === "empty" ? "Tasks are loaded from the accepted contract plan. Task progress, participant comments, and reference attachments are saved; task detail edits remain a local preview. Existing submissions, feedback, and revisions continue to use the project or milestone delivery flow." : project.proposedPlan ? project.applicationId ? "Tasks are loaded from the freelancer’s submitted application plan. Moving a task to In Progress saves the plan’s task records to this active project." : "Tasks are loaded from the agreed service-order project plan. Progress, comments, and attachments are freelancer workflow records separate from payment milestones." : "These board cards are a UI preview without saved task records. Existing submissions, feedback, and revisions remain saved at project or milestone level."}</p>
      </>}

      {visibleLoad.status === "loading" && <p role="status" className="rounded-md border px-3 py-4 text-sm text-muted-foreground">Loading the accepted task plan…</p>}
      {visibleLoad.status === "unknown" && <div role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-4 text-sm">{visibleLoad.message}</div>}
      {visibleLoad.status === "error" && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 px-3 py-4 text-sm"><span>{visibleLoad.message ?? "Unable to load the task plan."}</span><Button size="sm" variant="outline" onClick={() => void reloadTasks()}>Retry</Button></div>}
      {taskActionError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{taskActionError}</p>}
      {visibleLoad.status === "empty" && <p role="status" className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">{visibleLoad.message ?? "The accepted plan is versioned, but no persisted tasks were returned."}</p>}
      {visibleLoad.status === "legacy" && visibleLoad.message && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive">{visibleLoad.message}</p>}

      {visibleLoad.status === "legacy" && adding && <form onSubmit={addTask} className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="text-sm">Task title<Input autoFocus required maxLength={120} className="mt-1" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} /></label>
        <label className="text-sm">Description<Textarea maxLength={1000} className="mt-1 min-h-10" value={newDescription} onChange={(event) => setNewDescription(event.target.value)} /></label>
        <div className="flex gap-2"><Button type="submit" size="sm">Create task</Button><Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
      </form>}

      {(visibleLoad.status === "legacy" || visibleLoad.status === "versioned" || visibleLoad.status === "empty") && <div className={`grid gap-3 ${compact ? "md:grid-cols-3" : "md:grid-cols-3"}`}>
        {columns.map((column) => {
          const items = tasks.filter((task) => task.status === column);
          return <section
            key={column}
            aria-label={`${column} tasks`}
            onDragOver={(event) => {
              if (project.currentParty === "freelancer") event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const taskId = event.dataTransfer.getData("text/plain");
              if (taskId) moveTask(taskId, column);
            }}
            className="min-w-0 rounded-lg border bg-card/60 p-3 sm:p-4"
          >
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{column}</h3><span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span></div>
            <div className="space-y-2">
              {items.map((task) => <article key={task.id} className="rounded-lg border bg-background/50 p-3">
                <button
                  type="button"
                  draggable={project.currentParty === "freelancer"}
                  onDragStart={(event) => {
                    if (project.currentParty !== "freelancer") return;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", task.id);
                  }}
                  onClick={() => { setAttachmentError(""); setSelection({ key: taskKey, id: task.id }); }}
                  className={`block w-full rounded text-left transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${project.currentParty === "freelancer" ? "cursor-grab active:cursor-grabbing" : ""}`}
                >
                  <span className="flex items-start gap-1.5"><GripVertical aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"/><span className="min-w-0 flex-1 font-medium">{task.title}</span>{task.status === "Done" && <CheckCircle2 aria-label="Done" className="size-4 shrink-0 fill-emerald-600 text-emerald-600" />}</span>
                  <span className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {task.sourceStageName && <span className="rounded-full border px-2 py-0.5">{task.sourceStageName}</span>}
                    <span className={`rounded-full border px-2 py-0.5 ${task.priority === "High" ? "border-rose-500/30 text-rose-700 dark:text-rose-300" : ""}`}>{task.priority}</span>
                    {task.deadlineAt
                      ? <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Deadline {new Date(task.deadlineAt).toLocaleString()}</span>
                      : task.expectedDays && <span>Estimated {task.expectedDays} {task.expectedDays === 1 ? "day" : "days"}</span>}
                    {!task.deadlineAt && task.dueDate && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{new Date(`${task.dueDate}T12:00:00`).toLocaleDateString()}</span>}
                    {task.attachments.length > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{task.attachments.length}</span>}
                    {task.comments.length > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{task.comments.length}</span>}
                  </span>
                </button>
                {project.currentParty === "freelancer" && <label className="mt-2 flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
                  Move to
                  <StyledSelect aria-label={`Move ${task.title} to`} className="h-8 min-w-0 flex-1 rounded-md border border-border/80 bg-background px-2 text-xs text-foreground" value={task.status} disabled={savingTaskId === task.id || !canMoveTask(task)} onChange={(event) => void moveTask(task.id, event.target.value as TaskStatus)}>
                    {columns.map((status) => <option key={status} value={status} disabled={status !== task.status && !((task.status === "To Do" && status === "In Progress") || (task.status === "In Progress" && task.persistedStatus === "in_progress" && status === "Done"))}>{status}</option>)}
                  </StyledSelect>
                </label>}
              </article>)}
              {!items.length && <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No tasks</p>}
            </div>
          </section>;
        })}
      </div>}

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelection(null); }}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden border border-border/80 bg-popover p-0 shadow-2xl sm:max-w-5xl">
          {selected && <>
            <DialogHeader className="border-b px-5 py-4 pr-12 text-left">
              <DialogDescription className="sr-only">View this task, delivery activity, and discussion.</DialogDescription>
              <DialogTitle className="text-lg font-semibold">{selected.title}</DialogTitle>
              <p className="text-xs text-muted-foreground">In project <span className="font-medium text-foreground">{project.title}</span></p>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_300px]">
                <main className="min-w-0 space-y-4 bg-background/35 p-5">
                  <section aria-labelledby="task-description-heading" className="space-y-2 rounded-lg border border-border/60 bg-card/35 p-4">
                    <h3 id="task-description-heading" className="text-sm font-semibold">Task details</h3>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{selected.description || "No task description."}</p>
                  </section>

                  <section aria-labelledby="task-attachments-heading" className="space-y-3 rounded-lg border border-border/60 bg-card/45 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Paperclip className="h-4 w-4 text-muted-foreground"/><h3 id="task-attachments-heading" className="text-sm font-semibold">Attachments</h3></div>{project.currentParty === "freelancer" && project.projectId && selectedCommentKey && <Button type="button" size="sm" variant="outline" disabled={attachmentSaving} onClick={() => attachmentInput.current?.click()}><Paperclip className="mr-1.5 h-3.5 w-3.5"/>{attachmentSaving ? "Uploading…" : "Attach file"}</Button>}</div>
                    {project.currentParty === "freelancer" && project.projectId && selectedCommentKey && <input ref={attachmentInput} type="file" className="sr-only" aria-label="Choose a task attachment" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (!file) return; if (file.size > PROJECT_TASK_ATTACHMENT_MAX_BYTES) setAttachmentError("Choose a file that is 10 MB or smaller."); else void addAttachment(file); event.currentTarget.value = ""; }} />}
                    {attachmentError && <p role="alert" className="text-sm text-destructive">{attachmentError}</p>}
                    {selected.attachments.length ? <ul className="space-y-2">{selected.attachments.map((file) => <li key={file.attachment_id} className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm"><span className="flex min-w-0 items-center gap-2.5"><FileText className="h-4 w-4 shrink-0 text-muted-foreground"/><span className="min-w-0"><span className="block truncate font-medium">{file.file_name}</span><span className="text-xs text-muted-foreground">{file.content_type || "File"} · {(file.size_bytes / 1024).toFixed(0)} KB</span></span></span><Button type="button" size="sm" variant="ghost" onClick={() => void downloadAttachment(file)}>View / download</Button></li>)}</ul> : <p className="rounded-md bg-background/50 px-3 py-2.5 text-sm text-muted-foreground">{project.currentParty === "freelancer" ? "No reference files yet. Attach a file to keep it with this task." : "No reference files have been attached yet."}</p>}
                    <p className="text-xs text-muted-foreground">Freelancers can attach files to saved project tasks. Both project participants can view and download them; files are stored privately with this project and are separate from work submissions.</p>
                  </section>

                </main>

                <aside className="space-y-5 border-t bg-muted/35 p-5 lg:border-l lg:border-t-0" aria-label="Task properties and comments">
                  <section className="space-y-3"><h3 className="text-sm font-semibold">Task properties</h3>
                    <div className="space-y-1.5"><p className="text-xs font-medium text-muted-foreground">Status</p><p id="task-status" className="rounded-md border border-border/80 bg-background px-3 py-2 text-sm" data-database-status={selected.persistedStatus}>{selected.persisted ? selected.persistedStatusLabel : selected.status}</p></div>
                    {selected.deadlineAt && <div className="space-y-1.5"><p className="text-xs font-medium text-muted-foreground">Estimated deadline</p><p className="rounded-md border border-border/60 bg-background px-3 py-2 text-sm">{new Date(selected.deadlineAt).toLocaleString()}</p></div>}
                    {selected.dueDate && <div className="space-y-1.5"><p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CalendarDays className="h-3.5 w-3.5"/>Due date</p><p className="rounded-md border border-border/80 bg-background px-3 py-2 text-sm">{new Date(`${selected.dueDate}T12:00:00`).toLocaleDateString()}</p></div>}
                    <div className="space-y-1.5"><p className="text-xs font-medium text-muted-foreground">Priority</p><p className="rounded-md border border-border/80 bg-background px-3 py-2 text-sm">{selected.priority}</p></div>
                  </section>
                  <section className="space-y-3 border-t pt-4">
                    <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-muted-foreground"/><h3 className="text-sm font-semibold">Comments</h3></div>
                    <p className="text-xs text-muted-foreground">Comments are shared with both project participants.</p>
                    {commentLoadError && <p role="alert" className="text-xs text-destructive">{commentLoadError}</p>}
                    <ol className="space-y-3">
                      {[...selectedComments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((entry) => <li key={entry.id} className="border-b border-border/60 pb-2 last:border-0">
                        <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{entry.author}</span><time className="text-[10px] text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</time></div><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{entry.message}</p>
                      </li>)}
                      {!selectedComments.length && <li className="text-sm text-muted-foreground">No comments yet.</li>}
                    </ol>
                    {selectedCommentKey && project.projectId
                      ? <form onSubmit={(event) => void addComment(event)} className="space-y-2"><Textarea aria-label="Add a task comment" maxLength={2000} rows={2} className="resize-y border-border/80 bg-background/80 text-foreground placeholder:text-foreground/50" placeholder="Write a comment…" value={comment} onChange={(event) => setComment(event.target.value)}/><div className="flex justify-end"><Button variant="outline" size="sm" disabled={!comment.trim() || commentSaving}>{commentSaving ? "Sending…" : <><Check className="mr-1.5 h-4 w-4"/>Add comment</>}</Button></div></form>
                      : <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">Comments need a task linked to this project so both participants share the same discussion.</p>}
                  </section>
                </aside>
              </div>
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </section>
  );
}
