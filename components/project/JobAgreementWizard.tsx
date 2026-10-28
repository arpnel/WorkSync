"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, ClipboardList, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProjectPlanProposalAttachment } from "@/components/project/ProjectPlanProposalAttachment";
import type { ProjectPlanSnapshotData } from "@/services/project/projectPlanSnapshot";

type Step = 0 | 1 | 2;

interface JobAgreementWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  jobTitle: string;
  proposedPrice: number | null;
  estimatedDays: number | null;
  proposedPlan: ProjectPlanSnapshotData | null;
  onOpenExistingAgreement: () => Promise<void>;
}

function suggestedDeadline(days: number | null): string {
  const date = new Date();
  if (days && Number.isInteger(days) && days > 0) date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const steps = ["Contract Details", "Work Plan", "Review & Agreement"] as const;

export function JobAgreementWizard({
  open,
  onOpenChange,
  applicationId,
  jobTitle,
  proposedPrice,
  estimatedDays,
  proposedPlan,
  onOpenExistingAgreement,
}: JobAgreementWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [title, setTitle] = useState(jobTitle);
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState(proposedPrice == null ? "" : String(proposedPrice));
  const [revisions, setRevisions] = useState("0");
  const [deadline, setDeadline] = useState(() => suggestedDeadline(estimatedDays));
  const [plan, setPlan] = useState<ProjectPlanSnapshotData | null>(proposedPlan);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const planSource = useMemo(() => {
    if (!plan) return "No plan selected";
    return proposedPlan === plan || (proposedPlan && plan.name === proposedPlan.name && plan.content.columns === proposedPlan.content.columns)
      ? "Submitted application plan"
      : proposedPlan ? "Selected plan snapshot" : "Saved plan snapshot";
  }, [plan, proposedPlan]);

  function validateDetails() {
    const amount = Number(budget);
    const revisionCount = Number(revisions);
    if (!title.trim()) return "Enter a project title.";
    if (!description.trim()) return "Enter a project description.";
    if (!Number.isFinite(amount) || amount <= 0) return "Enter a budget greater than zero.";
    if (!revisions.trim() || !Number.isInteger(revisionCount) || revisionCount < 0) return "Enter a valid revision count.";
    if (!isCalendarDate(deadline)) return "Choose a valid delivery deadline.";
    return "";
  }

  function saveDraftNotice() {
    setNotice("Draft saving is not connected yet. Your entries remain only while this wizard is open; no contract or agreement was created.");
  }

  function continueFromDetails() {
    const validation = validateDetails();
    setError(validation);
    setNotice("");
    if (!validation) setStep(1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="max-h-[min(92dvh,920px)] w-[calc(100%-1rem)] max-w-6xl gap-0 overflow-hidden border border-white/10 bg-[#151918] p-0 text-white sm:w-[calc(100%-2rem)]">
        <DialogHeader className="border-b border-white/10 px-5 py-5 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4 pr-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Create Contract</p>
              <DialogTitle className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Build the agreement together</DialogTitle>
              <DialogDescription className="mt-2 max-w-2xl text-sm text-slate-400">Review the terms and proposed work plan before continuing to the existing agreement workspace.</DialogDescription>
            </div>
            <Badge variant="outline" className="border-emerald-400/30 bg-emerald-400/5 text-emerald-300">Visual prototype · {applicationId.slice(0, 8)}</Badge>
          </div>
          <ol aria-label="Contract creation steps" className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
            {steps.map((label, index) => {
              const active = step === index;
              const complete = step > index;
              return <li key={label} aria-current={active ? "step" : undefined} className={`min-w-0 border-t-2 pt-3 ${active || complete ? "border-emerald-400" : "border-white/10"}`}>
                <div className="flex items-center gap-2 text-xs sm:text-sm">
                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${active || complete ? "bg-emerald-400 text-slate-950" : "bg-white/10 text-slate-400"}`}>{complete ? <Check className="size-3.5"/> : index + 1}</span>
                  <span className={active ? "font-medium text-white" : "text-slate-400"}>{label}</span>
                </div>
              </li>;
            })}
          </ol>
        </DialogHeader>

        <div className="max-h-[calc(92dvh-210px)] overflow-y-auto px-5 py-5 sm:px-8 sm:py-7">
          {step === 0 && <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.8fr)]">
            <Card className="border-white/10 bg-[#1d2321] text-white shadow-none">
              <CardHeader><CardTitle className="text-lg text-white">Contract details</CardTitle><p className="text-sm text-slate-400">Set the scope and commercial terms for this project.</p></CardHeader>
              <CardContent className="space-y-4">
                <Field label="Project title" id="wizard-title" error={!title.trim() && error ? "A project title is required." : ""}><Input id="wizard-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!title.trim() && !!error} placeholder="e.g. Brand website redesign" className="border-white/10 bg-black/20 text-white placeholder:text-slate-500"/></Field>
                <Field label="Project description" id="wizard-description" error={!description.trim() && error ? "A project description is required." : ""}><Textarea id="wizard-description" value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={!description.trim() && !!error} placeholder="Describe the agreed scope and intended outcome…" className="min-h-28 border-white/10 bg-black/20 text-white placeholder:text-slate-500"/></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Budget (PHP)" id="wizard-budget" error={error && (!Number.isFinite(Number(budget)) || Number(budget) <= 0) ? "Enter a positive budget." : ""}><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span><Input id="wizard-budget" type="number" min="1" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} className="border-white/10 bg-black/20 pl-8 text-white"/></div></Field>
                  <Field label="Included revisions" id="wizard-revisions" error={error && (!Number.isInteger(Number(revisions)) || Number(revisions) < 0) ? "Enter zero or more revisions." : ""}><Input id="wizard-revisions" type="number" min="0" step="1" value={revisions} onChange={(e) => setRevisions(e.target.value)} className="border-white/10 bg-black/20 text-white"/></Field>
                </div>
                <Field label="Delivery deadline" id="wizard-deadline" error={error && !isCalendarDate(deadline) ? "Choose a valid delivery deadline." : ""}><div className="relative"><CalendarDays className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"/><Input id="wizard-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="border-white/10 bg-black/20 pl-10 text-white"/></div>{estimatedDays ? <p className="text-xs text-slate-500">Suggested from the application estimate of {estimatedDays} days; adjust as needed.</p> : null}</Field>
                {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
              </CardContent>
            </Card>
            <Card className="h-fit border-white/10 bg-[#1d2321] text-white shadow-none">
              <CardHeader><CardTitle className="text-base text-white">Contract summary</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <Summary label="Project" value={title || "Project title"}/><Summary label="Budget" value={budget ? `₱${Number(budget).toLocaleString("en-PH")}` : "Not set"}/><Summary label="Revisions" value={revisions || "Not set"}/><Summary label="Deadline" value={deadline || "Not set"}/>
                <div className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-relaxed text-amber-100/80">Prototype only. These values are not saved as a contract draft.</div>
              </CardContent>
            </Card>
          </div>}

          {step === 1 && <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Proposed work plan</h2><p className="mt-1 text-sm text-slate-400">Choose the submitted plan or attach a saved Project Planner plan. Reusable plans are copied here as a preview snapshot.</p></div><Badge variant="outline" className="border-white/10 text-slate-300">{planSource}</Badge></div>
            <ProjectPlanProposalAttachment value={plan} onChange={(next) => { setPlan(next); setNotice(""); }}/>
            {plan ? <PlanPreview plan={plan}/> : <div className="rounded-2xl border border-dashed border-white/15 bg-[#1d2321] px-5 py-12 text-center"><ClipboardList className="mx-auto size-8 text-slate-500"/><h3 className="mt-3 font-medium">No plan selected</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-400">Choose a plan above, or create one in the existing Project Plans page and attach it here. No example tasks have been added.</p></div>}
            <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-relaxed text-amber-100/80">Task durations and contract milestone links are not part of the current saved plan model. Plan edits are preview-only and are not persisted.</p>
          </div>}

          {step === 2 && <div className="mx-auto max-w-4xl space-y-5">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Final review</p><h2 className="mt-2 text-2xl font-semibold">Review the proposed agreement</h2><p className="mt-1 text-sm text-slate-400">This screen is read-only. Reviewing does not send, accept, sign, or activate an agreement.</p></div>
            <Card className="border-white/10 bg-[#1d2321] text-white shadow-none"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileText className="size-4 text-emerald-400"/>{title || "Untitled project"}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{description || "No project description entered."}</p><div className="grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-3"><Summary label="Budget" value={budget ? `₱${Number(budget).toLocaleString("en-PH")}` : "Not set"}/><Summary label="Included revisions" value={revisions || "Not set"}/><Summary label="Delivery deadline" value={deadline || "Not set"}/></div></CardContent></Card>
            {plan ? <><div><h3 className="font-semibold">Work plan · {plan.name}</h3><p className="mt-1 text-sm text-slate-400">{plan.description || "No plan description."}</p></div><PlanPreview plan={plan}/></> : <div role="alert" className="rounded-xl border border-rose-300/25 bg-rose-300/5 p-4 text-sm text-rose-100">Select a work plan before this review can be complete.</div>}
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-relaxed text-amber-100/80">The existing agreement flow does not receive these prototype edits. Opening it will not save this plan, and this review will not sign or activate a contract.</div>
          </div>}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-white/10 bg-black/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex flex-wrap gap-2">
            {step > 0 && <Button type="button" variant="outline" onClick={() => { setError(""); setNotice(""); setStep((step - 1) as Step); }} className="border-white/15 bg-transparent text-white hover:bg-white/5"> <ArrowLeft className="size-4"/> {step === 1 ? "Back to contract details" : "Back to planner"}</Button>}
            <Button type="button" variant="ghost" onClick={saveDraftNotice} className="text-slate-300 hover:bg-white/5 hover:text-white">Save draft</Button>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            {step === 0 && <Button type="button" onClick={continueFromDetails} className="bg-emerald-400 text-slate-950 hover:bg-emerald-300">Continue to planner <ArrowRight className="size-4"/></Button>}
            {step === 1 && <Button type="button" disabled={!plan} onClick={() => { setError(""); setNotice(""); setStep(2); }} className="bg-emerald-400 text-slate-950 hover:bg-emerald-300">Continue to review <ArrowRight className="size-4"/></Button>}
            {step === 2 && <Button type="button" onClick={() => void onOpenExistingAgreement()} className="bg-emerald-400 text-slate-950 hover:bg-emerald-300">Open existing agreement flow</Button>}
          </div>
        </div>
        {notice && <p role="status" className="border-t border-amber-300/15 bg-amber-300/5 px-5 py-3 text-sm text-amber-100/90 sm:px-8">{notice}</p>}
      </DialogContent>
    </Dialog>
  );
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year > 0 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function Field({ label, id, error, children }: { label: string; id: string; error?: string; children: ReactNode }) {
  return <div className="space-y-1.5"><label htmlFor={id} className="text-sm font-medium text-slate-200">{label}</label>{children}{error && <p className="text-xs text-rose-300">{error}</p>}</div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 break-words font-medium text-white">{value}</p></div>;
}

function PlanPreview({ plan }: { plan: ProjectPlanSnapshotData }) {
  const colors = ["border-emerald-400/50", "border-sky-300/40", "border-white/20"];
  return <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#1d2321] p-3"><div className="flex min-w-max gap-3">{plan.content.columns.map((column, index) => <section key={column.id} aria-label={`${column.name}, ${column.tasks.length} tasks`} className={`w-72 rounded-xl border-t-2 bg-black/15 p-4 ${colors[index % colors.length]}`}><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{column.name}</h3><Badge variant="secondary" className="bg-white/10 text-slate-200">{column.tasks.length}</Badge></div>{column.tasks.length ? <div className="mt-3 space-y-2">{column.tasks.map((task) => <article key={task.id} className="rounded-lg border border-white/10 bg-[#252c29] p-3"><h4 className="text-sm font-medium">{task.title}</h4>{task.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-400">{task.description}</p>}<Badge variant="outline" className="mt-2 border-white/10 text-slate-300">{task.priority} priority</Badge></article>)}</div> : <p className="mt-4 text-sm text-slate-500">No tasks in this stage.</p>}</section>)}</div></div>;
}
