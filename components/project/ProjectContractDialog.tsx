"use client";

import { CalendarDays, CheckCircle2, Clock3, FileText, RotateCcw, UserRound, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";

function date(value: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "Not set";
}

export function ProjectContractDialog({
  project,
  buttonLabel = "Agreed scope & contract",
}: {
  project: ProjectWorkspace;
  buttonLabel?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <FileText className="h-4 w-4" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="flex-row items-center gap-3 border-b bg-muted/30 px-5 py-4 pr-14 text-left sm:px-7 sm:pr-16">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="h-5 w-5" /></div>
          <div className="min-w-0 space-y-1">
            <DialogTitle className="text-xl">Agreed scope & contract</DialogTitle>
            <DialogDescription className="line-clamp-2">The shared terms and delivery details for {project.title}.</DialogDescription>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <article className="min-w-0 space-y-6 break-words p-5 text-sm leading-6 sm:p-7">
            <header>
              <h2 className="text-2xl font-semibold tracking-tight">{project.title}</h2>
              <p className="mt-1 capitalize text-muted-foreground">{project.type} project{project.categoryName ? ` · ${project.categoryName}` : ""}</p>
            </header>
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-4"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Wallet className="h-4 w-4" />Agreed amount</div><p className="mt-2 text-xl font-semibold">PHP {project.budget.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p></div>
              <div className="rounded-xl border p-4"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><CalendarDays className="h-4 w-4" />Delivery period</div><p className="mt-2 font-semibold">{project.deliveryDays == null ? "Not set" : `${project.deliveryDays} days`}</p></div>
              <div className="rounded-xl border p-4"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><RotateCcw className="h-4 w-4" />Revisions</div><p className="mt-2 font-semibold">{project.revisions == null ? "Not set" : project.revisions}</p></div>
            </section>
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4 text-primary" />People & scope</h3>
              <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Client</p><p className="mt-1 font-medium">{project.clientName}</p></div><div><p className="text-xs text-muted-foreground">Freelancer</p><p className="mt-1 font-medium">{project.freelancerName}</p></div></div>
              <div className="rounded-xl border bg-muted/20 p-4"><p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Project description</p><p className="whitespace-pre-wrap">{project.description || "No description provided."}</p></div>
              {project.terms && project.terms !== project.description && <div className="rounded-xl border p-4"><p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Additional terms</p><p className="whitespace-pre-wrap">{project.terms}</p></div>}
            </section>
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4 text-primary" />Schedule</h3>
              <dl className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
                {[ ["Work started", date(project.startDate)], ["Delivery deadline", date(project.dueDate)] ].map(([label, value]) => <div key={label} className="bg-background p-4"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}
              </dl>
            </section>
            {project.milestones.length > 0 && <section className="space-y-3"><h3 className="font-semibold">Agreed milestones</h3><ol className="space-y-3">{project.milestones.map((milestone, index) => <li key={milestone.id} className="flex gap-3 rounded-xl border p-4"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><h4 className="font-medium">{milestone.title}</h4><span className="text-sm font-semibold">PHP {milestone.amount.toLocaleString()}</span></div><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{milestone.description}</p><p className="mt-3 text-xs text-muted-foreground">Due {date(milestone.dueDate)}</p></div></li>)}</ol></section>}
            <section className="space-y-3 border-t pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Agreement confirmation</h3><span className="text-xs text-muted-foreground">Created {date(project.createdAt)}</span></div>
              <div className="grid gap-2 sm:grid-cols-2">{[["Client", project.clientSignedAt], ["Freelancer", project.freelancerSignedAt]].map(([label, signedAt]) => <div key={label} className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"><span className="text-sm font-medium">{label}</span><Badge variant={signedAt ? "secondary" : "outline"} className={signedAt ? "gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700" : "gap-1.5"}>{signedAt ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{signedAt ? "Confirmed" : "Awaiting"}</Badge></div>)}</div>
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2"><p>Client: {project.clientSignedAt ? date(project.clientSignedAt) : "Awaiting confirmation"}</p><p>Freelancer: {project.freelancerSignedAt ? date(project.freelancerSignedAt) : "Awaiting confirmation"}</p></div>
            </section>
          </article>
        </div>
      </DialogContent>
    </Dialog>
  );
}
