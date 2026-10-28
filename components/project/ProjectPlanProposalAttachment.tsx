"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Eye,
  FolderOpen,
  LoaderCircle,
  Paperclip,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  ProjectPlan,
  ProjectPlanSnapshot,
} from "@/services/project/projectPlans";
import { listProjectPlans } from "@/services/project/projectPlans";
import { supabase } from "@/lib/supabaseClient";

const stageAccents = [
  "border-t-primary/60",
  "border-t-ring/50",
  "border-t-muted-foreground/30",
];

function taskCount(plan: ProjectPlanSnapshot) {
  return plan.content.columns.reduce(
    (count, column) => count + column.tasks.length,
    0,
  );
}

export function ProjectPlanProposalAttachment({
  value,
  onChange,
}: {
  value: ProjectPlanSnapshot | null;
  onChange: (plan: ProjectPlanSnapshot | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"choose" | "selected" | "attached">(
    "choose",
  );
  const [plans, setPlans] = useState<ProjectPlan[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.plan_id === selectedId) ?? null,
    [plans, selectedId],
  );

  async function openPicker() {
    setOpen(true);
    setMode("choose");
    setSelectedId("");
    setLoading(true);
    setError("");
    try {
      const [auth, savedPlans] = await Promise.all([
        supabase.auth.getUser(),
        listProjectPlans(),
      ]);
      if (auth.error || !auth.data.user)
        throw new Error("Sign in to choose a saved project plan.");
      setPlans(savedPlans);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your project plans could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  function attachSelected() {
    if (!selectedPlan) return;
    onChange({
      name: selectedPlan.name,
      description: selectedPlan.description,
      content: {
        columns: selectedPlan.content.columns.map((column) => ({
          ...column,
          tasks: column.tasks.map((task) => ({ ...task })),
        })),
      },
    });
    setOpen(false);
  }

  const previewPlan: ProjectPlanSnapshot | null =
    mode === "attached" ? value : selectedPlan;
  const attachedTaskCount = value ? taskCount(value) : 0;

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void openPicker()}
      >
        <Paperclip />{" "}
        {value ? "Choose a different plan" : "Attach a project plan"}
      </Button>

      {value && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{value.name}</p>
            <p className="text-xs text-muted-foreground">
              {value.content.columns.length - 1} stages · {attachedTaskCount}{" "}
              tasks attached
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setMode("attached");
                setOpen(true);
              }}
            >
              <Eye /> View plan
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Remove attached project plan"
              onClick={() => onChange(null)}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={mode !== "selected" && mode !== "attached"}
          className={
            mode === "selected" || mode === "attached"
              ? "fixed inset-0 left-0 top-0 z-[60] flex h-dvh min-h-0 max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 sm:max-w-none"
              : "max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
          }
        >
          {(mode === "selected" || mode === "attached") && previewPlan ? (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>{previewPlan.name}</DialogTitle>
                <DialogDescription>
                  Full project plan board preview.
                </DialogDescription>
              </DialogHeader>
              <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={
                    mode === "selected"
                      ? "Back to choose project plans"
                      : "Back to proposal"
                  }
                  onClick={() =>
                    mode === "selected" ? setMode("choose") : setOpen(false)
                  }
                >
                  <ArrowLeft />
                </Button>
                <h1 className="min-w-0 flex-1 truncate text-base font-semibold">
                  {previewPlan.name}
                </h1>
              </header>
              <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                {previewPlan.description && (
                  <p className="mb-6 whitespace-pre-wrap text-sm text-muted-foreground">
                    {previewPlan.description}
                  </p>
                )}
                <div className="mb-4">
                  <h2 className="text-base font-semibold">Planning board</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Review the stages and tasks in this saved plan.
                  </p>
                </div>
                <section
                  aria-label="Project plan stages"
                  className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6"
                >
                  <div className="flex w-max min-w-full items-stretch gap-3 rounded-2xl bg-muted/10 p-2">
                    {previewPlan.content.columns.map((column, index) => (
                      <section
                        key={column.id}
                        aria-label={`${column.name}, ${column.tasks.length} tasks`}
                        className={`min-h-48 min-w-[17rem] max-w-[28rem] flex-[1_1_19rem] rounded-xl border-t-2 bg-muted/25 p-3 ${stageAccents[index % stageAccents.length]}`}
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <h3 className="truncate text-sm font-semibold">
                            {column.name}
                          </h3>
                          <Badge variant="secondary">
                            {column.tasks.length}
                          </Badge>
                        </div>
                        {column.tasks.length ? (
                          <div className="space-y-2">
                            {column.tasks.map((task) => (
                              <article
                                key={task.id}
                                className="rounded-lg border border-border/60 bg-card p-3 shadow-sm"
                              >
                                <h4 className="break-words text-sm font-medium">
                                  {task.title || "Untitled task"}
                                </h4>
                                {task.description && (
                                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                                    {task.description}
                                  </p>
                                )}
                                <Badge
                                  variant="outline"
                                  className="mt-2 capitalize"
                                >
                                  {task.priority} priority suggestion
                                </Badge>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="px-1 py-3 text-sm text-muted-foreground">
                            No tasks in this stage.
                          </p>
                        )}
                      </section>
                    ))}
                  </div>
                </section>
              </main>
              <DialogFooter className="mx-0 mb-0 shrink-0 border-t p-3 sm:px-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    mode === "selected" ? setMode("choose") : setOpen(false)
                  }
                >
                  {mode === "selected"
                    ? "Back to choose plans"
                    : "Back to proposal"}
                </Button>
                {mode === "selected" && (
                  <Button type="button" onClick={attachSelected}>
                    <Paperclip /> Attach selected plan
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {mode === "choose"
                    ? "Choose a project plan"
                    : mode === "attached"
                      ? "Attached project plan"
                      : "Review project plan"}
                </DialogTitle>
                <DialogDescription>
                  {mode === "choose"
                    ? "Select a saved plan to review and attach to this proposal."
                    : mode === "attached"
                      ? "This saved plan is attached as a snapshot to your proposal."
                      : "Review the full plan before attaching it to your proposal."}
                </DialogDescription>
              </DialogHeader>

              {mode === "choose" && (
                <div className="space-y-3">
                  {loading ? (
                    <div
                      className="flex items-center gap-2 rounded-lg border p-5 text-sm text-muted-foreground"
                      role="status"
                    >
                      <LoaderCircle className="size-4 motion-safe:animate-spin" />
                      Loading your project plans…
                    </div>
                  ) : error ? (
                    <div className="space-y-3 rounded-lg border border-destructive/40 p-4">
                      <p role="alert" className="text-sm text-destructive">
                        {error}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void openPicker()}
                      >
                        Try again
                      </Button>
                    </div>
                  ) : plans.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center">
                      <FolderOpen className="mx-auto size-5 text-muted-foreground" />
                      <p className="mt-2 text-sm font-medium">
                        No saved plans yet
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Create a project plan first, then return here to attach
                        it.
                      </p>
                      <Button
                        asChild
                        type="button"
                        variant="outline"
                        className="mt-3"
                      >
                        <Link
                          href="/home/project-plans?create=1"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Create a new project plan <ExternalLink />
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="max-h-52 space-y-2 overflow-y-auto">
                        {plans.map((plan) => (
                          <button
                            key={plan.plan_id}
                            type="button"
                            onClick={() => {
                              setSelectedId(plan.plan_id);
                              setMode("selected");
                            }}
                            className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary ${selectedId === plan.plan_id ? "border-primary bg-primary/5 ring-1 ring-primary" : ""}`}
                          >
                            <span className="block truncate text-sm font-medium">
                              {plan.name}
                            </span>
                            <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                              {plan.description || "No plan summary."}
                            </span>
                            <span className="mt-2 block text-xs text-muted-foreground">
                              {plan.content.columns.length - 1} stages ·{" "}
                              {taskCount(plan)} tasks
                              {plan.shared ? " · Shared plan" : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {plans.length > 0 && !loading && !error && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button
                        asChild
                        type="button"
                        variant="link"
                        size="sm"
                        className="px-0"
                      >
                        <Link
                          href="/home/project-plans?create=1"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Create a new project plan <ExternalLink />
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
