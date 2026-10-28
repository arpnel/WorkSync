"use client";

import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProjectPlanSnapshot } from "@/services/project/projectPlans";

const stageAccents = [
  "border-t-primary/60",
  "border-t-ring/50",
  "border-t-muted-foreground/30",
];

export function ProjectPlanSnapshotPreview({
  plan,
  open,
  onOpenChange,
}: {
  plan: ProjectPlanSnapshot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!plan) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="fixed inset-0 left-0 top-0 z-[70] flex h-dvh min-h-0 max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 sm:max-w-none">
        <DialogHeader className="sr-only">
          <DialogTitle>{plan.name}</DialogTitle>
          <DialogDescription>Full project plan board preview.</DialogDescription>
        </DialogHeader>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Back to application details"
            onClick={() => onOpenChange(false)}
          >
            <ArrowLeft />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold">
            {plan.name}
          </h1>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {plan.description && (
            <p className="mb-6 whitespace-pre-wrap text-sm text-muted-foreground">
              {plan.description}
            </p>
          )}
          <div className="mb-4">
            <h2 className="text-base font-semibold">Planning board</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Review the stages and tasks in this project plan.
            </p>
          </div>
          <section
            aria-label="Project plan stages"
            className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6"
          >
            <div className="flex w-max min-w-full items-stretch gap-3 rounded-2xl bg-muted/10 p-2">
              {plan.content.columns.map((column, index) => (
                <section
                  key={column.id}
                  aria-label={`${column.name}, ${column.tasks.length} tasks`}
                  className={`min-h-48 min-w-[17rem] max-w-[28rem] flex-[1_1_19rem] rounded-xl border-t-2 bg-muted/25 p-3 ${stageAccents[index % stageAccents.length]}`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold">
                      {column.name}
                    </h3>
                    <Badge variant="secondary">{column.tasks.length}</Badge>
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
                          <Badge variant="outline" className="mt-2 capitalize">
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
      </DialogContent>
    </Dialog>
  );
}
