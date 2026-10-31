"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  Copy,
  Eye,
  GripVertical,
  Info,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pin,
  PencilLine,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import {
  listProjectPlans,
  dropPlanStageBefore,
  removeProjectPlan,
  saveProjectPlan,
  shareProjectPlan,
  unshareProjectPlan,
  normalizePlanContent,
  type PlanColumn,
  type PlanContent,
  type PlanTask,
  type ProjectPlan,
} from "@/services/project/projectPlans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const newId = () => crypto.randomUUID();
const blankPlan = (): {
  name: string;
  description: string;
  content: PlanContent;
} => ({
  name: "",
  description: "",
  content: {
    columns: [{ id: newId(), name: "New stage", type: "stage", tasks: [] }],
  },
});
const cleanPlanContent = (content: PlanContent): PlanContent => ({
  columns: normalizePlanContent(content, false).columns.map((column) => ({
    id: column.id,
    name: column.name,
    type: column.type,
    pinned: column.pinned ?? false,
    tasks: column.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      priority: task.priority ?? "medium",
      expectedDays: task.expectedDays,
    })),
  })),
});
const stageAccents = [
  "border-t-primary/60",
  "border-t-ring/50",
  "border-t-muted-foreground/30",
];

export default function ProjectPlansLibrary() {
  const [plans, setPlans] = useState<ProjectPlan[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<ProjectPlan | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    description: string;
    content: PlanContent;
  }>(blankPlan());
  const [savedSnapshot, setSavedSnapshot] = useState(draft);
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [showPlanningHint, setShowPlanningHint] = useState(true);
  const [draggingStageId, setDraggingStageId] = useState<string | null>(null);
  const [dropTargetStageId, setDropTargetStageId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [taskDialog, setTaskDialog] = useState<{
    columnId: string;
    taskId: string;
  } | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    priority: "medium" as PlanTask["priority"],
    expectedDays: "",
  });
  const [editorDelete, setEditorDelete] = useState<{
    kind: "task" | "column";
    columnId: string;
    taskId?: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectPlan | null>(null);
  const [shareTarget, setShareTarget] = useState<ProjectPlan | null>(null);
  const [recipient, setRecipient] = useState("");
  const createRequested = useRef(false);
  const editRequestedPlanId = useRef("");
  const returnToProposal = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [
        {
          data: { user },
          error: authError,
        },
        rows,
      ] = await Promise.all([supabase.auth.getUser(), listProjectPlans(false)]);
      if (authError || !user)
        throw new Error("Sign in to open your project plans.");
      setUserId(user.id);
      setPlans(rows);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Plans could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const currentDialogTask = taskDialog
    ? draft.content.columns
        .find((column) => column.id === taskDialog.columnId)
        ?.tasks.find((task) => task.id === taskDialog.taskId)
    : undefined;
  const taskFormDirty =
    !!taskDialog &&
    !!currentDialogTask?.title &&
    (taskForm.title !== currentDialogTask.title ||
      taskForm.description !== currentDialogTask.description ||
      taskForm.priority !== currentDialogTask.priority ||
      taskForm.expectedDays !== (currentDialogTask.expectedDays?.toString() ?? ""));
  const dirty =
    editing &&
    (JSON.stringify(draft) !== JSON.stringify(savedSnapshot) || taskFormDirty);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const sorted = useMemo(
    () =>
      plans
        .filter((plan) =>
          `${plan.name} ${plan.description}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name)
            : sort === "created"
              ? b.created_at.localeCompare(a.created_at)
              : b.updated_at.localeCompare(a.updated_at),
        ),
    [plans, query, sort],
  );
  const open = useCallback((plan: ProjectPlan, edit: boolean) => {
    const nextDraft = {
      name: plan.name,
      description: plan.description,
      content: normalizePlanContent(structuredClone(plan.content), false),
    };
    setSelected(plan);
    setDraft(nextDraft);
    setSavedSnapshot(nextDraft);
    setEditing(edit);
    setPreviewing(false);
    setDetailsOpen(!plan.description);
  }, []);
  const create = useCallback(() => {
    setSelected(null);
    const nextDraft = blankPlan();
    setDraft(nextDraft);
    setSavedSnapshot(nextDraft);
    setEditing(true);
    setPreviewing(false);
    setDetailsOpen(true);
  }, []);
  useEffect(() => {
    if (loading || !userId || createRequested.current) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("create") !== "1") return;
    returnToProposal.current = url.searchParams.get("returnTo") === "proposal";
    createRequested.current = true;
    url.searchParams.delete("create");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    create();
  }, [create, loading, userId]);
  useEffect(() => {
    if (loading || !userId) return;
    const url = new URL(window.location.href);
    const requestedPlanId = url.searchParams.get("edit");
    if (!requestedPlanId || editRequestedPlanId.current === requestedPlanId)
      return;
    const plan = plans.find((item) => item.plan_id === requestedPlanId);
    if (!plan || plan.owner_id !== userId) return;
    editRequestedPlanId.current = requestedPlanId;
    url.searchParams.delete("edit");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    open(plan, true);
  }, [loading, open, plans, userId]);
  const close = () => {
    if (
      dirty &&
      !window.confirm("Discard unsaved changes and leave this plan?")
    )
      return;
    if (
      returnToProposal.current &&
      window.opener &&
      !window.opener.closed
    ) {
      window.opener.focus();
      window.close();
      return;
    }
    setSelected(null);
    setEditing(false);
    setPreviewing(false);
    setTaskDialog(null);
    setEditorDelete(null);
  };
  const mutateColumn = (
    columnId: string,
    update: (column: PlanColumn) => PlanColumn,
  ) =>
    setDraft((d) => ({
      ...d,
      content: {
        columns: d.content.columns.map((c) =>
          c.id === columnId ? update(c) : c,
        ),
      },
    }));
  const moveTask = (columnId: string, taskId: string, direction: -1 | 1) =>
    mutateColumn(columnId, (c) => {
      const i = c.tasks.findIndex((t) => t.id === taskId);
      const j = i + direction;
      if (j < 0 || j >= c.tasks.length) return c;
      const tasks = [...c.tasks];
      [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
      return { ...c, tasks };
    });
  const updateTask = (
    columnId: string,
    taskId: string,
    patch: Partial<PlanTask>,
  ) =>
    mutateColumn(columnId, (c) => ({
      ...c,
      tasks: c.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
    }));
  const handleTaskDrop = (
    event: React.DragEvent,
    targetColumn: string,
    targetIndex?: number,
  ) => {
    event.preventDefault();
    const payload = event.dataTransfer.getData(
      "application/worksync-plan-task",
    );
    if (!payload) return;
    try {
      const { sourceColumn, taskId } = JSON.parse(payload) as {
        sourceColumn: string;
        taskId: string;
      };
      setDraft((current) => {
        const columns = current.content.columns.map((column) => ({
          ...column,
          tasks: [...column.tasks],
        }));
        const source = columns.find((column) => column.id === sourceColumn);
        const target = columns.find((column) => column.id === targetColumn);
        const sourceIndex =
          source?.tasks.findIndex((task) => task.id === taskId) ?? -1;
        if (!source || !target || sourceIndex < 0) return current;
        const [task] = source.tasks.splice(sourceIndex, 1);
        const insertAt =
          targetIndex === undefined
            ? target.tasks.length
            : Math.max(0, Math.min(targetIndex, target.tasks.length));
        target.tasks.splice(insertAt, 0, task);
        return { ...current, content: { columns } };
      });
    } catch {
      /* Ignore invalid drag payloads. */
    }
  };
  const handleStageDrop = (event: React.DragEvent, targetStageId: string) => {
    const payload = event.dataTransfer.getData(
      "application/worksync-plan-stage",
    );
    if (!payload) return;
    event.preventDefault();
    setDraggingStageId(null);
    setDropTargetStageId(null);
    try {
      const { stageId } = JSON.parse(payload) as { stageId: string };
      setDraft((current) => ({
        ...current,
        content: dropPlanStageBefore(
          current.content,
          stageId,
          targetStageId,
          false,
        ),
      }));
    } catch {
      /* Ignore malformed drag payloads. */
    }
  };
  const allTasks = (plan: ProjectPlan | typeof draft) =>
    plan.content.columns.flatMap((column) => column.tasks);

  const beginAddTask = (columnId: string) => {
    const task = {
      id: newId(),
      title: "",
      description: "",
      priority: "medium" as const,
    };
    mutateColumn(columnId, (column) => ({
      ...column,
      tasks: [...column.tasks, task],
    }));
    setTaskForm({ title: "", description: "", priority: "medium", expectedDays: "" });
    setTaskDialog({ columnId, taskId: task.id });
  };
  const editTask = (columnId: string, task: PlanTask) => {
    setTaskForm({
      title: task.title,
      description: task.description,
      priority: task.priority,
      expectedDays: task.expectedDays?.toString() ?? "",
    });
    setTaskDialog({ columnId, taskId: task.id });
  };
  const commitTaskDialog = () => {
    if (!taskDialog) return;
    if (!taskForm.title.trim()) {
      toast.error("Enter a task title to add it to this plan.");
      return;
    }
    const expectedDays = Number(taskForm.expectedDays);
    if (
      !taskForm.expectedDays.trim() ||
      !Number.isInteger(expectedDays) ||
      expectedDays < 1 ||
      expectedDays > 3650
    ) {
      toast.error("Enter a whole number of estimated days from 1 to 3650.");
      return;
    }
    updateTask(taskDialog.columnId, taskDialog.taskId, {
      title: taskForm.title.trim(),
      description: taskForm.description,
      priority: taskForm.priority,
      expectedDays,
    });
    setTaskDialog(null);
  };
  const cancelTaskDialog = () => {
    if (taskDialog) {
      mutateColumn(taskDialog.columnId, (column) => ({
        ...column,
        tasks: column.tasks.filter(
          (task) => task.id !== taskDialog.taskId || Boolean(task.title.trim()),
        ),
      }));
    }
    setTaskDialog(null);
  };
  const addColumn = () => {
    const newStage: PlanColumn = {
      id: newId(),
      name: "New stage",
      type: "stage",
      tasks: [],
    };
    setDraft((current) => {
      const columns = normalizePlanContent(current.content, false).columns;
      const doneIndex = columns.findIndex((column) => column.type === "done");
      columns.splice(doneIndex < 0 ? columns.length : doneIndex, 0, newStage);
      return { ...current, content: { columns } };
    });
  };
  const copyColumn = (columnId: string) => {
    const source = draft.content.columns.find(
      (column) => column.id === columnId,
    );
    if (!source) return;
    const copy: PlanColumn = {
      ...source,
      id: newId(),
      name: `${source.name} copy`,
      type: "stage",
      pinned: false,
      tasks: source.tasks.map((task) => ({ ...task, id: newId() })),
    };
    setDraft((current) => {
      const columns = normalizePlanContent(current.content, false).columns;
      const sourceIndex = columns.findIndex((column) => column.id === columnId);
      if (sourceIndex < 0) return current;
      columns.splice(
        source.type === "done" ? sourceIndex : sourceIndex + 1,
        0,
        copy,
      );
      return { ...current, content: { columns } };
    });
  };
  const moveAllTasks = (sourceId: string, destinationId: string) =>
    setDraft((current) => {
      const columns = current.content.columns.map((column) => ({
        ...column,
        tasks: [...column.tasks],
      }));
      const source = columns.find((column) => column.id === sourceId);
      const destination = columns.find((column) => column.id === destinationId);
      if (!source || !destination || source === destination) return current;
      destination.tasks.push(...source.tasks);
      source.tasks = [];
      return { ...current, content: { columns } };
    });
  const sortTasks = (
    columnId: string,
    sort: "title-asc" | "title-desc" | "priority-high" | "priority-low",
  ) =>
    mutateColumn(columnId, (column) => {
      const tasks = [...column.tasks];
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      tasks.sort((a, b) => {
        if (sort === "title-asc") return a.title.localeCompare(b.title);
        if (sort === "title-desc") return b.title.localeCompare(a.title);
        const difference =
          priorityOrder[a.priority] - priorityOrder[b.priority];
        const directed = sort === "priority-high" ? difference : -difference;
        return directed || a.title.localeCompare(b.title);
      });
      return { ...column, tasks };
    });

  async function save() {
    if (!draft.name.trim()) {
      toast.error("Enter a plan name.");
      return;
    }
    const cleaned = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      content: cleanPlanContent({
        columns: draft.content.columns.map((column) => ({
          ...column,
          tasks: column.tasks
            .filter((task) => task.title.trim())
            .map((task) => ({ ...task, title: task.title.trim() })),
        })),
      }),
    };
    setBusy(true);
    try {
      const saved = selected
        ? await saveProjectPlan({ ...selected, ...cleaned }, userId, false)
        : await saveProjectPlan(cleaned, userId, false);
      setSelected(saved);
      setDraft(cleaned);
      setSavedSnapshot(cleaned);
      setPreviewing(false);
      toast.success("Project plan saved.");
      await refresh();
      if (
        returnToProposal.current &&
        window.opener &&
        !window.opener.closed
      ) {
        window.opener.postMessage(
          { type: "worksync:project-plan-created" },
          window.location.origin,
        );
        window.opener.focus();
        window.close();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save this plan.");
    } finally {
      setBusy(false);
    }
  }
  async function duplicate(plan: ProjectPlan) {
    try {
      await saveProjectPlan(
        {
          name: `${plan.name} copy`,
          description: plan.description,
          content: cleanPlanContent(structuredClone(plan.content)),
        },
        userId,
        false,
      );
      toast.success("Independent copy created.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Copy failed.");
    }
  }
  async function doShare() {
    if (!shareTarget || !recipient.trim()) return;
    try {
      await shareProjectPlan(shareTarget.plan_id, userId, recipient.trim());
      toast.success("Read-only access granted.");
      setShareTarget(null);
      setRecipient("");
      await refresh();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not share this plan.",
      );
    }
  }

  if (selected || editing)
    return (
      <main className="mx-auto min-w-0 max-w-7xl space-y-4">
        <header className="flex flex-wrap items-center gap-3 border-b pb-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to My Project Plans"
            onClick={close}
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            {editing && !previewing ? (
              <div className="flex max-w-xl items-center gap-1">
                <Input
                  aria-label="Plan name"
                  maxLength={120}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Untitled plan"
                  className="h-9 border-transparent px-2 text-lg font-semibold shadow-none focus-visible:border-input sm:text-xl"
                />
              </div>
            ) : (
              <h1 className="truncate px-2 text-lg font-semibold sm:text-xl">
                {draft.name || "Untitled plan"}
              </h1>
            )}
          </div>
          {editing && (
            <Button
              variant="outline"
              onClick={() => setPreviewing((value) => !value)}
            >
              <Eye />
              {previewing ? "Continue editing" : "Preview"}
            </Button>
          )}
          {!editing && selected?.owner_id === userId && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit plan
            </Button>
          )}
          {editing && !previewing && (
            <Button onClick={() => void save()} disabled={busy || !dirty}>
              {busy ? "Saving…" : "Save plan"}
            </Button>
          )}
        </header>

        {editing && !previewing ? (
          <section className="rounded-xl bg-muted/25 px-4 py-3">
            <button
              type="button"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 rounded focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="text-left">
                <span className="block text-sm font-medium">Plan details</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Add a short purpose so you can recognize when to reuse this
                  template.
                </span>
              </span>
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${detailsOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            {detailsOpen && (
              <Textarea
                aria-label="Plan purpose and description"
                maxLength={2000}
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Describe the kind of work this template can organize."
                className="mt-3 min-h-20 resize-y bg-background"
              />
            )}
          </section>
        ) : draft.description ? (
          <p className="px-1 text-sm text-muted-foreground">
            {draft.description}
          </p>
        ) : null}

        {editing && !previewing && showPlanningHint && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <Info className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="min-w-0 flex-1">
              Create your task structure here. You can set actual deadlines and
              assignments when you use this plan for a project.
            </p>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss planning guidance"
              onClick={() => setShowPlanningHint(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <h2 className="text-base font-semibold">Planning board</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Arrange stages in the order work typically unfolds.
            </p>
          </div>
          {editing && !previewing && (
            <Button variant="outline" size="sm" onClick={addColumn}>
              <Plus /> Add stage
            </Button>
          )}
        </div>
        <section
          aria-label="Project plan stages"
          className="-mx-4 min-w-0 overflow-x-auto px-4 pb-4 sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6"
        >
          <div className="flex w-max min-w-full items-stretch gap-3 rounded-2xl bg-muted/10 p-2">
            {draft.content.columns.map((column, columnIndex) => (
              <section
                key={column.id}
                aria-label={`${column.name}, ${column.tasks.length} tasks`}
                draggable={editing && !previewing && column.type !== "done"}
                onDragStart={(event) => {
                  if (!editing || previewing || column.type === "done") return;
                  if (
                    Array.from(event.dataTransfer.types).includes(
                      "application/worksync-plan-task",
                    )
                  ) {
                    return;
                  }
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(
                    "application/worksync-plan-stage",
                    JSON.stringify({ stageId: column.id }),
                  );
                  setDraggingStageId(column.id);
                }}
                onDragEnd={() => {
                  setDraggingStageId(null);
                  setDropTargetStageId(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (
                    editing &&
                    !previewing &&
                    Array.from(event.dataTransfer.types).includes(
                      "application/worksync-plan-stage",
                    )
                  ) {
                    setDropTargetStageId(column.id);
                  }
                }}
                onDrop={(event) => {
                  if (!editing || previewing) return;
                  if (
                    Array.from(event.dataTransfer.types).includes(
                      "application/worksync-plan-stage",
                    )
                  ) {
                    handleStageDrop(event, column.id);
                  } else {
                    handleTaskDrop(event, column.id);
                  }
                }}
                className={`min-h-48 min-w-[17rem] max-w-[28rem] flex-[1_1_19rem] rounded-xl border-t-2 bg-muted/25 p-3 transition ${stageAccents[columnIndex % stageAccents.length]} ${editing && !previewing && column.type !== "done" ? "cursor-grab active:cursor-grabbing" : ""} ${draggingStageId === column.id ? "opacity-50" : ""} ${dropTargetStageId === column.id ? "ring-2 ring-primary/40" : ""}`}
              >
                <div className="mb-3 flex items-center gap-2">
                  {editing && !previewing ? (
                    <Input
                      id={`project-plan-stage-${column.id}`}
                      aria-label="Stage name"
                      maxLength={80}
                      value={column.name}
                      onChange={(event) =>
                        mutateColumn(column.id, (current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className="h-9 border-transparent bg-transparent px-2 font-semibold shadow-none focus-visible:border-input"
                    />
                  ) : (
                    <h2 className="min-w-0 flex-1 truncate px-2 font-semibold">
                      {column.name}
                    </h2>
                  )}
                  <Badge variant="secondary" className="shrink-0">
                    {column.tasks.length}
                  </Badge>
                  {column.pinned && (
                    <span
                      className="shrink-0 text-primary"
                      aria-label="Pinned stage"
                      title="Pinned stage"
                    >
                      <Pin className="size-3.5" aria-hidden="true" />
                    </span>
                  )}
                  {editing && !previewing && column.type !== "done" && (
                    <span
                      title={`Drag to reorder ${column.name}`}
                      aria-hidden="true"
                      className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
                    >
                      <GripVertical className="size-4" />
                    </span>
                  )}
                  {editing && !previewing && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${column.name}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="w-80 max-w-[calc(100vw-2rem)]"
                      >
                        <DropdownMenuLabel>Stage actions</DropdownMenuLabel>
                        <DropdownMenuItem
                          onSelect={() => beginAddTask(column.id)}
                        >
                          <Plus /> Add task
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => copyColumn(column.id)}
                        >
                          <Copy /> Copy stage
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            document
                              .getElementById(`project-plan-stage-${column.id}`)
                              ?.focus()
                          }
                        >
                          <PencilLine /> Rename stage
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger
                            disabled={!column.tasks.length}
                          >
                            Move all tasks in stage
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {draft.content.columns
                              .filter((target) => target.id !== column.id)
                              .map((target) => (
                                <DropdownMenuItem
                                  key={target.id}
                                  onSelect={() =>
                                    moveAllTasks(column.id, target.id)
                                  }
                                >
                                  {target.name}
                                </DropdownMenuItem>
                              ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger
                            disabled={column.tasks.length < 2}
                          >
                            Sort tasks by
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem
                              onSelect={() => sortTasks(column.id, "title-asc")}
                            >
                              Title: A to Z
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                sortTasks(column.id, "title-desc")
                              }
                            >
                              Title: Z to A
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                sortTasks(column.id, "priority-high")
                              }
                            >
                              Priority: High to low
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                sortTasks(column.id, "priority-low")
                              }
                            >
                              Priority: Low to high
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                          checked={Boolean(column.pinned)}
                          onCheckedChange={(pinned) =>
                            mutateColumn(column.id, (current) => ({
                              ...current,
                              pinned,
                            }))
                          }
                        >
                          <Pin /> Pin stage
                        </DropdownMenuCheckboxItem>
                        {column.type !== "done" && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={() =>
                              setEditorDelete({
                                kind: "column",
                                columnId: column.id,
                              })
                            }
                          >
                            <Trash2 /> Delete stage
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {column.tasks.length === 0 ? (
                  editing && !previewing ? (
                    <div className="rounded-lg bg-background/60 px-3 py-4">
                      <p className="text-sm font-medium">Start this stage</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Add a task to outline this part of the work.
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 -ml-2"
                        onClick={() => beginAddTask(column.id)}
                      >
                        <Plus /> Add first task
                      </Button>
                    </div>
                  ) : (
                    <p className="px-3 py-3 text-sm text-muted-foreground">
                      No tasks in this stage.
                    </p>
                  )
                ) : (
                  <div className="space-y-2">
                    {column.tasks.map((task, taskIndex) => (
                      <Card
                        key={task.id}
                        draggable={editing && !previewing}
                        onDragStart={(event) =>
                          event.dataTransfer.setData(
                            "application/worksync-plan-task",
                            JSON.stringify({
                              sourceColumn: column.id,
                              taskId: task.id,
                            }),
                          )
                        }
                        onDragOver={(event) =>
                          editing && !previewing && event.preventDefault()
                        }
                        onDrop={(event) => {
                          if (editing && !previewing) {
                            if (
                              Array.from(event.dataTransfer.types).includes(
                                "application/worksync-plan-stage",
                              )
                            ) {
                              return;
                            }
                            event.stopPropagation();
                            handleTaskDrop(event, column.id, taskIndex);
                          }
                        }}
                        className={`border-border/60 bg-card shadow-sm ${editing && !previewing ? "cursor-pointer active:cursor-grabbing" : ""}`}
                      >
                        <CardContent
                          className={`relative flex items-start gap-2 p-3 ${editing && !previewing ? "cursor-pointer active:cursor-grabbing" : ""}`}
                        >
                          {editing && !previewing && (
                            <button
                              type="button"
                              onClick={() => editTask(column.id, task)}
                              className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                              aria-label={`Edit task ${task.title || "Untitled task"}`}
                            />
                          )}
                          {editing && !previewing && (
                            <GripVertical
                              className="relative z-10 mt-0.5 size-4 shrink-0 text-muted-foreground pointer-events-none"
                              aria-label="Drag to reorder task"
                            />
                          )}
                          <div className="relative z-10 min-w-0 flex-1 pointer-events-none">
                            <span className="block break-words text-sm font-medium">
                              {task.title || "Untitled task"}
                            </span>
                            {task.description && (
                              <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                                {task.description}
                              </span>
                            )}
                            {task.priority && (
                              <span className="mt-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                                {task.priority} priority suggestion
                              </span>
                            )}
                            {task.expectedDays != null && (
                              <span className="mt-2 block text-xs text-muted-foreground">
                                Estimated {task.expectedDays} {task.expectedDays === 1 ? "day" : "days"}
                              </span>
                            )}
                          </div>
                          {editing && !previewing && (
                            <div className="relative z-20">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Task actions: ${task.title || "Untitled task"}`}
                                  >
                                    <MoreHorizontal />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="start"
                                  className="w-56 max-w-[calc(100vw-2rem)]"
                                >
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      mutateColumn(column.id, (current) => {
                                        const tasks = [...current.tasks];
                                        tasks.splice(taskIndex + 1, 0, {
                                          ...task,
                                          id: newId(),
                                          title: `${task.title} copy`,
                                        });
                                        return { ...current, tasks };
                                      })
                                    }
                                  >
                                    <Copy /> Duplicate task
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={taskIndex === 0}
                                    onSelect={() =>
                                      moveTask(column.id, task.id, -1)
                                    }
                                  >
                                    <ArrowUp /> Move up
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={
                                      taskIndex === column.tasks.length - 1
                                    }
                                    onSelect={() =>
                                      moveTask(column.id, task.id, 1)
                                    }
                                  >
                                    <ArrowDown /> Move down
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onSelect={() =>
                                      setEditorDelete({
                                        kind: "task",
                                        columnId: column.id,
                                        taskId: task.id,
                                      })
                                    }
                                  >
                                    <Trash2 /> Delete task
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                {editing && !previewing && column.tasks.length > 0 && (
                  <Button
                    variant="ghost"
                    className="mt-2 w-full justify-start text-muted-foreground"
                    onClick={() => beginAddTask(column.id)}
                  >
                    <Plus /> Add task
                  </Button>
                )}
              </section>
            ))}
          </div>
        </section>

        <Dialog
          open={!!taskDialog}
          onOpenChange={(open) => {
            if (!open) cancelTaskDialog();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {taskDialog &&
                draft.content.columns
                  .flatMap((column) => column.tasks)
                  .some((task) => task.id === taskDialog.taskId && task.title)
                  ? "Edit task"
                  : "Add a task"}
              </DialogTitle>
              <DialogDescription>
                Describe a step in this reusable plan. Set real deadlines when
                work becomes an active project.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                autoFocus
                aria-label="Task title"
                maxLength={160}
                placeholder="Task title"
                value={taskForm.title}
                onChange={(event) =>
                  setTaskForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
              <Textarea
                aria-label="Task description"
                maxLength={1000}
                placeholder="Description (optional)"
                value={taskForm.description}
                onChange={(event) =>
                  setTaskForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
              <label className="grid gap-1 text-sm">
                Estimated days
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  step={1}
                  inputMode="numeric"
                  required
                  onKeyDown={(event) => {
                    if (event.key === "." || event.key === ",") event.preventDefault();
                  }}
                  aria-label="Estimated days"
                  placeholder="e.g. 3"
                  value={taskForm.expectedDays}
                  onChange={(event) =>
                    setTaskForm((current) => ({ ...current, expectedDays: event.target.value }))
                  }
                />
              </label>
              <label className="grid gap-1 text-sm">
                Priority suggestion{" "}
                <select
                  className="h-9 rounded-md border bg-background px-2"
                  value={taskForm.priority}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      priority: event.target.value as PlanTask["priority"],
                    }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  cancelTaskDialog();
                }}
              >
                Cancel
              </Button>
              <Button onClick={commitTaskDialog}>
                {taskForm.title.trim() ? "Save task" : "Add task"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog
          open={!!editorDelete}
          onOpenChange={(open) => !open && setEditorDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {editorDelete?.kind === "column"
                  ? "Delete this stage?"
                  : "Delete this task?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {editorDelete?.kind === "column"
                  ? "Tasks in this stage will also be removed from this plan."
                  : "This task will be removed from this plan."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!editorDelete) return;
                  if (editorDelete.kind === "column")
                    setDraft((current) => ({
                      ...current,
                      content: {
                        columns: current.content.columns.filter(
                          (column) => column.id !== editorDelete.columnId,
                        ),
                      },
                    }));
                  else
                    mutateColumn(editorDelete.columnId, (column) => ({
                      ...column,
                      tasks: column.tasks.filter(
                        (task) => task.id !== editorDelete.taskId,
                      ),
                    }));
                  setEditorDelete(null);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    );
  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            My Project Plans
          </h1>
          <p className="mt-1 text-muted-foreground">
            Create, organize, and reuse project plans for your freelance work.
          </p>
        </div>
        <Button onClick={create}>
          <Plus /> Create Project Plan
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label="Search plans by name"
            placeholder="Search plans"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Sort project plans"
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="updated">Recently Updated</option>
          <option value="created">Recently Created</option>
          <option value="name">Name</option>
        </select>
        <Button
          variant="outline"
          size="icon"
          aria-label="Grid view"
          aria-pressed={view === "grid"}
          onClick={() => setView("grid")}
        >
          <LayoutGrid />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="List view"
          aria-pressed={view === "list"}
          onClick={() => setView("list")}
        >
          <List />
        </Button>
      </div>
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((x) => (
            <Card key={x} className="h-52 animate-pulse bg-muted" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p role="alert" className="text-destructive">
              {error}
            </p>
            <Button variant="outline" onClick={() => void refresh()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : !sorted.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <h2 className="text-lg font-semibold">
              {plans.length
                ? "No plans match your search"
                : "Start with a reusable plan"}
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Save a task plan once, then adapt a copy whenever similar work
              comes along.
            </p>
            <Button onClick={create}>
              <Plus /> Create Project Plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div
          className={
            view === "grid"
              ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              : "space-y-3"
          }
        >
          {sorted.map((plan) => (
            <Card key={plan.plan_id} className="overflow-hidden">
              <CardContent className="p-4">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => open(plan, false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      open(plan, false);
                    }
                  }}
                  className="cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <div className="mb-3 flex gap-2 overflow-hidden">
                    {plan.content.columns.slice(0, 3).map((c) => (
                      <div
                        key={c.id}
                        className="min-w-0 flex-1 rounded-md bg-muted p-2"
                      >
                        <p className="truncate text-[10px] font-semibold">
                          {c.name}
                        </p>
                        {c.tasks.slice(0, 2).map((t) => (
                          <div
                            key={t.id}
                            className="mt-1 truncate rounded bg-background p-1 text-[9px]"
                          >
                            {t.title || "Untitled task"}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <h2 className="truncate font-semibold">{plan.name}</h2>
                  {plan.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    {allTasks(plan).length} tasks Â· Updated{" "}
                    {new Date(plan.updated_at).toLocaleDateString()} Â·{" "}
                    {plan.shared ? "Shared" : "Private"}
                  </p>
                </div>
                <div className="mt-3 flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={`Actions for ${plan.name}`}
                        variant="ghost"
                        size="icon"
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {plan.owner_id === userId && (
                        <>
                          <DropdownMenuItem onSelect={() => open(plan, true)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              const name = window.prompt(
                                "Rename project plan",
                                plan.name,
                              );
                              if (name?.trim())
                                void saveProjectPlan({ ...plan, name }, userId, false)
                                  .then(refresh)
                                  .catch(() => toast.error("Rename failed."));
                            }}
                          >
                            Rename
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem onSelect={() => void duplicate(plan)}>
                        <Copy />{" "}
                        {plan.owner_id === userId
                          ? "Duplicate"
                          : "Copy to my plans"}
                      </DropdownMenuItem>
                      {plan.owner_id === userId && (
                        <>
                          <DropdownMenuItem
                            onSelect={() => {
                              setShareTarget(plan);
                              setRecipient("");
                            }}
                          >
                            Share
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={() => setDeleteTarget(plan)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes â€œ{deleteTarget?.name}â€ and its shares. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteTarget) return;
                void removeProjectPlan(deleteTarget.plan_id)
                  .then(refresh)
                  .then(() => toast.success("Plan deleted."))
                  .catch(() => toast.error("Delete failed."));
                setDeleteTarget(null);
              }}
            >
              Delete plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {shareTarget && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setShareTarget(null)
          }
        >
          <Card className="w-full max-w-md">
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="font-semibold">Share â€œ{shareTarget.name}â€</h2>
                <p className="text-sm text-muted-foreground">
                  Grant read-only access using the recipientâ€™s WorkSync user
                  ID. They can copy it into their library; your original stays
                  yours.
                </p>
              </div>
              <Input
                aria-label="Recipient WorkSync user ID"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Recipient user ID"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShareTarget(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void doShare()}
                  disabled={!recipient.trim()}
                >
                  Share read-only
                </Button>
              </div>
              {shareTarget.owner_id === userId && (
                <div className="border-t pt-3">
                  <p className="mb-2 text-sm font-medium">Current recipients</p>
                  {(
                    plans.find(
                      (p) => p.plan_id === shareTarget.plan_id,
                    ) as ProjectPlan & {
                      project_plan_shares?: { recipient_id: string }[];
                    }
                  )?.project_plan_shares?.map((share) => (
                    <div
                      key={share.recipient_id}
                      className="flex items-center justify-between py-1 text-sm"
                    >
                      <span className="truncate">{share.recipient_id}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void unshareProjectPlan(
                            shareTarget.plan_id,
                            share.recipient_id,
                          ).then(refresh)
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
