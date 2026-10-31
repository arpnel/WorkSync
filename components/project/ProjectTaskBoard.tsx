"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  FileText,
  GripVertical,
  MessageSquare,
  Pencil,
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
import { loadProjectTasks, type PersistedProjectTask } from "@/services/project/projectTaskService";
import { loadContractTaskPlanMode } from "@/services/project/projectTaskPlanMetadataService";
import { TaskSubmissionPanel } from "./TaskSubmissionPanel";

type TaskStatus = "To Do" | "In Progress" | "Done";
type Priority = "High" | "Medium" | "Low";
type TaskComment = { id: string; author: string; message: string; createdAt: string };
type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: string;
  priority: Priority;
  comments: TaskComment[];
  attachments: File[];
  milestoneId: string | null;
  workScope: boolean;
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
  return project.type === "milestone" && project.milestones.length
    ? project.milestones.map((milestone) => ({
      id: `milestone-${milestone.id}`,
      title: milestone.title,
      description: milestone.description || "Work and review for this agreed milestone.",
      status: ["approved", "completed"].includes(milestone.status) ? "Done" as TaskStatus : ["active", "in_progress", "revision"].includes(milestone.status) ? "In Progress" as TaskStatus : "To Do" as TaskStatus,
      dueDate: milestone.dueDate?.slice(0, 10) ?? "",
      priority: "Medium" as Priority,
      comments: [],
      attachments: [],
      milestoneId: milestone.id,
      workScope: true,
    }))
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
    persistedStatus: task.status,
    persistedStatusLabel: task.statusDisplay.label,
    persisted: true,
  }));
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
    const metadata = await loadContractTaskPlanMode(project.contractId, project.contractVersion);
    if (metadata.mode === "legacy") return { status: "legacy", tasks: legacyTaskFallback(project) };
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
  onRefresh,
  paid,
  actions,
  compact = false,
}: {
  project: ProjectWorkspace;
  onRefresh: () => Promise<void>;
  paid: boolean;
  actions?: ReactNode;
  compact?: boolean;
}) {
  const [taskLoad, setTaskLoad] = useState<TaskBoardLoadState>(() => loadingTaskBoardState(""));
  const [selection, setSelection] = useState<{ key: string; id: string } | null>(null);
  const loadSequence = useRef(0);
  const taskKey = workspaceTaskKey(project);
  const columns = completedColumns;
  const reloadTasks = useCallback(async () => {
    const sequence = ++loadSequence.current;
    const key = workspaceTaskKey(project);
    setTaskLoad(loadingTaskBoardState(key));
    const result = await loadProjectTaskBoardData(project);
    if (!isCurrentTaskBoardResponse(key, taskKey, sequence, loadSequence.current)) return;
    setTaskLoad({ key, ...result });
  }, [project, taskKey]);

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
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [comment, setComment] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const attachmentInput = useRef<HTMLInputElement>(null);

  function updateSelected(patch: Partial<Task>) {
    if (!selected) return;
    setTaskLoad((current) => current.key === taskKey
      ? { ...current, tasks: current.tasks.map((task) => task.id === selected.id ? { ...task, ...patch } : task) }
      : current);
  }

  function moveTask(taskId: string, status: TaskStatus) {
    if (project.currentParty !== "freelancer") return;
    setTaskLoad((current) => current.key === taskKey
      ? { ...current, tasks: current.tasks.map((task) => task.id === taskId ? { ...task, status } : task) }
      : current);
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

  function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !comment.trim()) return;
    const next: TaskComment = {
      id: crypto.randomUUID(),
      author: project.currentParty === "client" ? project.clientName : project.freelancerName,
      message: comment.trim(),
      createdAt: new Date().toISOString(),
    };
    updateSelected({ comments: [...selected.comments, next] });
    setComment("");
  }

  function addAttachment(file: File) {
    if (!selected) return;
    updateSelected({ attachments: [...selected.attachments, file] });
    setAttachmentError("");
  }

  function downloadAttachment(file: File) {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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

      <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">{visibleLoad.status === "versioned" || visibleLoad.status === "empty" ? "Tasks are loaded from the accepted contract plan. Task edits, comments, and reference attachments are still a local preview. Existing submissions, feedback, and revisions continue to use the project or milestone delivery flow." : "Board cards and comments are a UI preview and are not saved yet. Existing submissions, feedback, and revisions remain saved at project or milestone level."}</p>
      </>}

      {visibleLoad.status === "loading" && <p role="status" className="rounded-md border px-3 py-4 text-sm text-muted-foreground">Loading the accepted task plan…</p>}
      {visibleLoad.status === "unknown" && <div role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-4 text-sm">{visibleLoad.message}</div>}
      {visibleLoad.status === "error" && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 px-3 py-4 text-sm"><span>{visibleLoad.message ?? "Unable to load the task plan."}</span><Button size="sm" variant="outline" onClick={() => void reloadTasks()}>Retry</Button></div>}
      {visibleLoad.status === "empty" && <p role="status" className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">The accepted plan is versioned, but no persisted tasks were returned.</p>}

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
              {items.map((task) => <button
                key={task.id}
                type="button"
                draggable={project.currentParty === "freelancer"}
                onDragStart={(event) => {
                  if (project.currentParty !== "freelancer") return;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", task.id);
                }}
                onClick={() => { setAttachmentError(""); setSelection({ key: taskKey, id: task.id }); }}
                className={`block w-full rounded-lg border bg-background/50 p-3 text-left transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${project.currentParty === "freelancer" ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                <span className="flex items-start gap-1.5"><GripVertical aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"/><span className="min-w-0 flex-1 font-medium">{task.title}</span>{task.status === "Done" && <CheckCircle2 aria-label="Done" className="size-4 shrink-0 fill-emerald-600 text-emerald-600" />}</span>
                <span className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className={`rounded-full border px-2 py-0.5 ${task.priority === "High" ? "border-rose-500/30 text-rose-700 dark:text-rose-300" : ""}`}>{task.priority}</span>
                  {task.dueDate && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{new Date(`${task.dueDate}T12:00:00`).toLocaleDateString()}</span>}
                  {task.attachments.length > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{task.attachments.length}</span>}
                  {task.comments.length > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{task.comments.length}</span>}
                </span>
              </button>)}
              {!items.length && <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No tasks</p>}
            </div>
          </section>;
        })}
      </div>}

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelection(null); setEditingDescription(false); } }}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden border border-border/80 bg-popover p-0 shadow-2xl sm:max-w-5xl">
          {selected && <>
            <DialogHeader className="border-b px-5 py-4 pr-12 text-left">
              <DialogTitle className="sr-only">Task details</DialogTitle>
              <DialogDescription className="sr-only">Edit this task, view delivery activity, and discuss next steps.</DialogDescription>
              <Input aria-label="Task title" className="h-auto border-0 px-0 text-lg font-semibold shadow-none focus-visible:ring-0" maxLength={120} value={selected.title} onChange={(event) => updateSelected({ title: event.target.value })} />
              <p className="text-xs text-muted-foreground">In project <span className="font-medium text-foreground">{project.title}</span></p>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_300px]">
                <main className="min-w-0 space-y-4 bg-background/35 p-5">
                  <section aria-labelledby="task-description-heading" className="space-y-2 rounded-lg border border-border/60 bg-card/35 p-4">
                    <div className="flex items-center justify-between gap-2"><h3 id="task-description-heading" className="text-sm font-semibold">Task details</h3><Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setEditingDescription((editing) => !editing)}><Pencil className="mr-1.5 h-3.5 w-3.5" />{editingDescription ? "Done" : "Edit"}</Button></div>
                    {editingDescription ? <Textarea autoFocus maxLength={1000} value={selected.description} onChange={(event) => updateSelected({ description: event.target.value })} placeholder="Add task requirements and notes" /> : <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{selected.description || "Add a description to outline the task requirements."}</p>}
                  </section>

                  <section aria-labelledby="task-attachments-heading" className="space-y-3 rounded-lg border border-border/60 bg-card/45 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Paperclip className="h-4 w-4 text-muted-foreground"/><h3 id="task-attachments-heading" className="text-sm font-semibold">Attachments</h3></div><Button type="button" size="sm" variant="outline" onClick={() => attachmentInput.current?.click()}><Paperclip className="mr-1.5 h-3.5 w-3.5"/>Attach file</Button></div>
                    <input ref={attachmentInput} type="file" className="sr-only" aria-label="Choose a task attachment" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (!file) return; if (file.size > 1024 * 1024 * 1024) setAttachmentError("Choose a file smaller than 1 GB."); else addAttachment(file); event.currentTarget.value = ""; }} />
                    {attachmentError && <p role="alert" className="text-sm text-destructive">{attachmentError}</p>}
                    {selected.attachments.length ? <ul className="space-y-2">{selected.attachments.map((file, index) => <li key={`${file.name}-${index}`} className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm"><span className="flex min-w-0 items-center gap-2.5"><FileText className="h-4 w-4 shrink-0 text-muted-foreground"/><span className="min-w-0"><span className="block truncate font-medium">{file.name}</span><span className="text-xs text-muted-foreground">{file.type || file.name.split(".").pop()?.toUpperCase() || "Unknown file type"}</span></span></span><Button type="button" size="sm" variant="ghost" onClick={() => downloadAttachment(file)}>Download</Button></li>)}</ul> : <p className="rounded-md bg-background/50 px-3 py-2.5 text-sm text-muted-foreground">No reference files yet. Attach a file to keep it with this task.</p>}
                    <p className="text-xs text-muted-foreground">Preview only: task attachments stay in this browser and are not saved. They are separate from work submissions.</p>
                  </section>

                  {selected.workScope
                    ? <TaskSubmissionPanel project={project} taskTitle={selected.title} milestoneId={selected.milestoneId} paid={paid} onRefresh={onRefresh} />
                    : <section className="space-y-2 border-t pt-5"><h3 className="text-sm font-semibold">Work submission</h3><p className="text-sm text-muted-foreground">Formal submissions are not linked to this task yet. Project and milestone submissions remain on their existing delivery scope and are not copied here.</p></section>}
                </main>

                <aside className="space-y-5 border-t bg-muted/35 p-5 lg:border-l lg:border-t-0" aria-label="Task properties and comments">
                  <section className="space-y-3"><h3 className="text-sm font-semibold">Task properties</h3><div className="space-y-2"><label htmlFor="task-status" className="text-xs font-medium text-muted-foreground">{project.currentParty === "freelancer" ? "Board column (preview)" : "Status"}</label>{project.currentParty === "freelancer" ? <StyledSelect id="task-status" className="h-10 w-full rounded-md border border-border/80 bg-background px-3 text-sm" value={selected.status} onChange={(event) => updateSelected({ status: event.target.value as TaskStatus })}>{columns.map((status) => <option key={status}>{status}</option>)}</StyledSelect> : <p id="task-status" className="rounded-md border border-border/80 bg-background px-3 py-2 text-sm" data-database-status={selected.persistedStatus}>{selected.persisted ? selected.persistedStatusLabel : selected.status}</p>}{project.currentParty === "freelancer" && <p className="text-xs text-muted-foreground">Moving a card changes its board position only. Delivery approval and project completion still follow the review process.</p>}</div>
                  <div className="space-y-2"><label htmlFor="task-due-date" className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><CalendarDays className="h-3.5 w-3.5"/>Due date</label><Input id="task-due-date" type="date" className="h-10 border-border/80 bg-background" value={selected.dueDate} onChange={(event) => updateSelected({ dueDate: event.target.value })}/></div>
                  <div className="space-y-2"><label htmlFor="task-priority" className="text-xs font-medium text-muted-foreground">Priority</label><StyledSelect id="task-priority" className="h-10 w-full rounded-md border border-border/80 bg-background px-3 text-sm" value={selected.priority} onChange={(event) => updateSelected({ priority: event.target.value as Priority })}>{(["High", "Medium", "Low"] as Priority[]).map((priority) => <option key={priority}>{priority}</option>)}</StyledSelect></div></section>
                  <section className="space-y-3 border-t pt-4">
                    <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-muted-foreground"/><h3 className="text-sm font-semibold">Comments</h3></div>
                    <p className="text-xs text-muted-foreground">Preview only: comments are not saved.</p>
                    <ol className="space-y-3">
                      {[...selected.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((entry) => <li key={entry.id} className="border-b border-border/60 pb-2 last:border-0">
                        <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{entry.author}</span><time className="text-[10px] text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</time></div><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{entry.message}</p>
                      </li>)}
                      {!selected.comments.length && <li className="text-sm text-muted-foreground">No comments yet.</li>}
                    </ol>
                    <form onSubmit={addComment} className="space-y-2"><Textarea aria-label="Add a task comment" maxLength={2000} rows={2} className="resize-y border-border/80 bg-background/80 text-foreground placeholder:text-foreground/50" placeholder="Write a comment…" value={comment} onChange={(event) => setComment(event.target.value)}/><div className="flex justify-end"><Button variant="outline" size="sm" disabled={!comment.trim()}><Check className="mr-1.5 h-4 w-4"/>Add comment</Button></div></form>
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
