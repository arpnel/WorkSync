"use client";
import { useState, type ReactNode } from "react";
import { LockKeyhole, CheckCircle2 } from "lucide-react";
import type { ProjectPayment } from "@/services/payments/paymentService";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";
import { ProjectWorkspaceHeader } from "./ProjectWorkspaceHeader";
import { ProjectDeliveryPanel } from "./ProjectDeliveryPanel";
import { ProjectPaymentPanel } from "./ProjectPaymentPanel";
import { ProjectResolutionPanel } from "./ProjectResolutionPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ActiveProjectWorkspace({
  project,
  chat,
  onRefresh,
  onBack,
  error,
}: {
  project: ProjectWorkspace;
  chat: ReactNode;
  onRefresh: () => Promise<void>;
  onBack: () => void;
  error: string | null;
}) {
  const [payment, setPayment] = useState<ProjectPayment | null>(null);
  const paid =
    payment?.status === "paid" && Number(payment.amount) === project.budget;
  const completed = project.status.toLowerCase() === "completed";
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6">
      <ProjectWorkspaceHeader
        compact
        title={project.title}
        description={project.description}
        categoryName={project.categoryName}
        status={project.status}
        type={project.type}
        onBack={onBack}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)] xl:grid-cols-[minmax(0,1fr)_440px]">
        <main className="min-w-0 space-y-5">
          {completed && (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-50">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <CheckCircle2 className="h-5 w-5" />
                Project completed
              </h2>
              <p className="mt-2 text-sm">
                The client has approved the final work. Your deliveries,
                feedback, agreement, and conversation remain available here.
                Leave a review below to finish your project experience.
              </p>
            </section>
          )}
          {!paid && !completed && (
            <section className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4 text-sm">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <h2 className="font-medium">Payment required to upload work</h2>
                <p className="text-muted-foreground">
                  {project.currentParty === "client"
                    ? "Complete the agreed payment to start work."
                    : "Uploads unlock when the client completes payment."}
                </p>
                <a
                  href="#project-payment"
                  className="inline-block font-medium underline underline-offset-4"
                >
                  View payment
                </a>
              </div>
            </section>
          )}
          <ProjectDeliveryPanel
            key={project.projectId}
            project={project}
            onRefresh={onRefresh}
            paid={paid}
            actions={
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    Project resolution
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Project resolution</DialogTitle>
                    <DialogDescription>
                      Manage cancellation requests, disputes, and their history.
                    </DialogDescription>
                  </DialogHeader>
                  <ProjectResolutionPanel
                    orderStatus={project.orderStatus}
                    orderId={project.orderId}
                    projectId={project.projectId}
                    status={project.status}
                    userId={project.currentUserId}
                    milestones={project.milestones}
                    onRefresh={onRefresh}
                  />
                </DialogContent>
              </Dialog>
            }
          />
          {project.type === "milestone" && (
            <details
              className="space-y-3 rounded-xl border bg-background p-4"
              aria-label="Milestone progress"
            >
              <summary className="cursor-pointer font-medium">
                Milestones ·{" "}
                {
                  project.milestones.filter(
                    (milestone) => milestone.status === "approved",
                  ).length
                }
                /{project.milestones.length} approved
              </summary>
              <ol className="space-y-3">
                {project.milestones.map((milestone, index) => (
                  <li
                    key={milestone.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-muted/30 p-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {index + 1}. {milestone.title}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                        {milestone.description}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        PHP {milestone.amount.toLocaleString()}
                        {milestone.dueDate
                          ? ` · Due ${new Date(milestone.dueDate).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                    <span className="rounded-full border px-2 py-1 text-xs capitalize">
                      {milestone.status.replaceAll("_", " ")}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </main>
        <aside
          className="min-w-0 space-y-5"
          aria-label="Project payment and messages"
        >
          <section
            id="project-payment"
            className="scroll-mt-6"
            aria-label="Project payment"
          >
            <ProjectPaymentPanel project={project} onPayment={setPayment} />
          </section>
          <section
            id="project-conversation"
            className="scroll-mt-6"
            aria-label="Project conversation"
          >
            {chat}
          </section>
        </aside>
      </div>
    </div>
  );
}
