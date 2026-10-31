"use client";
import { useState, useEffect } from "react";
import { projectIsOverdue } from "@/lib/projectSettlement";
import { CheckCircle2, ClipboardList, KanbanSquare, LockKeyhole, Shield, CalendarDays } from "lucide-react";
import type { ProjectPayment } from "@/services/payments/paymentService";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";
import { ProjectWorkspaceHeader } from "./ProjectWorkspaceHeader";
import { ProjectMeetingsDialog } from "./ProjectMeetingsDialog";
import { ProjectTaskBoard } from "./ProjectTaskBoard";
import { ProjectProgressSummary } from "./ProjectProgressSummary";
import { RecentProjectActivity } from "./RecentProjectActivity";
import { ProjectPaymentPanel } from "./ProjectPaymentPanel";
import { ProjectContractDialog } from "./ProjectContractDialog";
import { ProjectResolutionPanel } from "./ProjectResolutionPanel";
import { ProjectCancellationNotice } from "./ProjectCancellationNotice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  onRefresh,
  onBack,
  error,
}: {
  project: ProjectWorkspace;
  onRefresh: () => Promise<void>;
  onBack: () => void;
  error: string | null;
}) {
  const [view, setView] = useState<"overview" | "kanban">("overview");
  const [payment, setPayment] = useState<ProjectPayment | null>(null);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const paid = payment?.status === "paid" && Number(payment.amount) === project.budget;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const overdue = projectIsOverdue(project.status, project.dueDate, now);
  const completed = project.status.toLowerCase() === "completed";

  if (view === "kanban") {
    return (
      <div className="mx-auto w-full max-w-[1440px] space-y-3">
        <div className="border-b">
          <ProjectWorkspaceHeader compact title={project.title} description={project.description} categoryName={project.categoryName} status={project.status} type={project.type} onBack={onBack} />
          <nav aria-label="Project views" className="flex gap-6 px-2 pt-2">
            {([["overview", "Overview", ClipboardList], ["kanban", "Kanban board", KanbanSquare]] as const).map(([key, label, Icon]) => (
              <button key={key} type="button" aria-current={view === key ? "page" : undefined} onClick={() => setView(key)} className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-1 text-sm font-semibold transition-colors ${view === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Icon className="size-4" />{label}
              </button>
            ))}
          </nav>
        </div>
        <header className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 sm:px-5">
          <div aria-hidden="true" className="hidden size-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary sm:grid"><KanbanSquare className="size-6" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold sm:text-xl">{project.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="rounded-md border border-emerald-500/40 px-2 py-0.5 font-medium capitalize text-emerald-600 dark:text-emerald-400">{project.status}</span>
              <span>{project.type === "milestone" ? "Milestone Project" : "Standard Project"}</span>
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />Deadline: {project.dueDate ? new Date(project.dueDate).toLocaleDateString() : "Not set"}</span>
            </div>
          </div>
        </header>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <ProjectTaskBoard key={project.projectId} compact project={project} onRefresh={onRefresh} paid={paid} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 sm:space-y-5">
      <div className="border-b">
        <ProjectWorkspaceHeader compact title={project.title} description={project.description} categoryName={project.categoryName} status={project.status} type={project.type} onBack={onBack} />
        <nav aria-label="Project views" className="flex gap-6 px-2 pt-2">
          {([["overview", "Overview", ClipboardList], ["kanban", "Kanban board", KanbanSquare]] as const).map(([key, label, Icon]) => (
            <button key={key} type="button" aria-current={view === key ? "page" : undefined} onClick={() => setView(key)} className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-1 text-sm font-semibold transition-colors ${view === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <Icon className="size-4" />{label}
            </button>
          ))}
        </nav>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {overdue && <section role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <h2 className="text-sm font-semibold">Delivery is overdue</h2>
        <p className="mt-1 text-sm text-muted-foreground">{project.currentParty === "freelancer" ? "The agreed deadline has passed. Share an update with your client and submit the outstanding work." : "The agreed deadline has passed. The project remains open while you discuss the next steps."} A missed deadline does not cancel the project.</p>
      </section>}
      {completed && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-50">
        <h2 className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-5" />Project completed</h2>
        <p className="mt-1 text-sm">The final work has been approved. Your deliveries, feedback, and agreement remain available here. Leave a review below to finish your project experience.</p>
      </section>}
      {project.projectId && project.orderId && <ProjectCancellationNotice project={project} onReview={() => setResolutionOpen(true)} />}

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_410px] sm:gap-5">
        <main className="min-w-0 space-y-4">
          {view === "overview" ? <>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Project overview</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <p className="text-sm leading-6 text-muted-foreground">{project.description || "No project description was provided."}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="min-w-0 border-t pt-3 sm:border-r sm:border-t-0 sm:pr-4 sm:pt-0">
                    <p className="text-xs font-medium text-muted-foreground">Client</p><p className="mt-2 truncate text-sm font-medium">{project.clientName}</p>
                  </div>
                  <div className="min-w-0 border-t pt-3 sm:border-t-0 sm:pt-0">
                    <p className="text-xs font-medium text-muted-foreground">Freelancer</p><p className="mt-2 truncate text-sm font-medium">{project.freelancerName}</p>
                  </div>
                </div>
                <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-3">
                  <div><span className="block text-xs text-muted-foreground">Project type</span><span className="mt-1 block font-medium capitalize">{project.type} project</span></div>
                  <div><span className="block text-xs text-muted-foreground">Category</span><span className="mt-1 block font-medium">{project.categoryName || "Not specified"}</span></div>
                  <div><span className="block text-xs text-muted-foreground">Deadline</span><span className="mt-1 flex items-center gap-1.5 font-medium"><CalendarDays className="size-3.5" />{project.dueDate ? new Date(project.dueDate).toLocaleDateString() : "Not set"}</span></div>
                </div>
              </CardContent>
            </Card>
            <ProjectProgressSummary project={project} />
            {project.type === "milestone" && <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Milestone summary</CardTitle></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {project.milestones.map((milestone, index) => <div key={milestone.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs text-muted-foreground">Milestone {index + 1}</p><h3 className="mt-1 text-sm font-medium">{milestone.title}</h3></div><span className="shrink-0 rounded-full border px-2 py-1 text-xs capitalize">{milestone.status.replaceAll("_", " ")}</span></div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{milestone.description}</p>
                  <p className="text-xs text-muted-foreground">PHP {milestone.amount.toLocaleString()}{milestone.dueDate ? ` · Due ${new Date(milestone.dueDate).toLocaleDateString()}` : ""}</p>
                </div>)}
              </CardContent>
            </Card>}
            <RecentProjectActivity project={project} />
          </> : <>
            {!paid && !completed && <section className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4 text-sm">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-muted-foreground"/><div className="space-y-1"><h2 className="font-medium">Payment required to upload work</h2><p className="text-muted-foreground">{project.currentParty === "client" ? "Complete the agreed payment to start work." : "Uploads unlock when the client completes payment."}</p></div>
            </section>}
            <ProjectTaskBoard key={project.projectId} project={project} onRefresh={onRefresh} paid={paid} actions={<>
              {project.projectId && <ProjectMeetingsDialog projectId={project.projectId} active={!completed} />}
              <Dialog open={resolutionOpen} onOpenChange={setResolutionOpen}>
                <DialogTrigger asChild><Button variant="outline" size="sm">Project resolution</Button></DialogTrigger>
                <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Project resolution</DialogTitle><DialogDescription>Manage cancellation requests, disputes, and their history.</DialogDescription></DialogHeader><ProjectResolutionPanel orderStatus={project.orderStatus} orderId={project.orderId} projectId={project.projectId} status={project.status} userId={project.currentUserId} milestones={project.milestones} onRefresh={onRefresh} /></DialogContent>
              </Dialog>
            </>} />
          </>}
        </main>

        <aside className="min-w-0 space-y-4" aria-label="Project details and actions">
          <section aria-label="Project payment"><ProjectPaymentPanel project={project} onPayment={setPayment} showContractDetails={false} /></section>
          <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="size-4 text-muted-foreground" />Agreed scope &amp; contract</CardTitle></CardHeader><CardContent className="space-y-2"><ProjectContractDialog project={project} buttonLabel="View scope & contract" /><p className="text-sm text-muted-foreground">Review the agreed scope of work and signed contract.</p></CardContent></Card>
          {project.projectId && <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="size-4 text-muted-foreground" />Project actions</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <ProjectMeetingsDialog projectId={project.projectId} active={!completed} />
              <Dialog open={resolutionOpen} onOpenChange={setResolutionOpen}>
                <DialogTrigger asChild><Button variant="outline" className="w-full justify-start gap-2"><Shield className="size-4" />Project resolution</Button></DialogTrigger>
                <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Project resolution</DialogTitle><DialogDescription>Manage cancellation requests, disputes, and their history.</DialogDescription></DialogHeader><ProjectResolutionPanel orderStatus={project.orderStatus} orderId={project.orderId} projectId={project.projectId} status={project.status} userId={project.currentUserId} milestones={project.milestones} onRefresh={onRefresh} /></DialogContent>
              </Dialog>
            </CardContent>
          </Card>}
        </aside>
      </div>
    </div>
  );
}
