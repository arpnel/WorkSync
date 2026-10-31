"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Eye, FileText, FileUp, GripVertical, MessageSquare, Paperclip, Pencil, RotateCcw, Wallet, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProjectChatPanel } from "@/components/project/ProjectChatPanel";
import { ProjectPlanSnapshotPreview } from "@/components/project/ProjectPlanSnapshotPreview";
import type { ProjectPlanSnapshotData } from "@/services/project/projectPlanSnapshot";
import type { ContractVersionAgreementInput } from "@/services/project/projectWorkspaceService";
import {
  loadContractCreationDraft,
  saveContractCreationDraft,
} from "@/services/project/contractCreationDraftService";

type WizardPlan = Omit<ProjectPlanSnapshotData, "content"> & {
  content: Omit<ProjectPlanSnapshotData["content"], "columns"> & {
    columns: Array<Omit<ProjectPlanSnapshotData["content"]["columns"][number], "tasks"> & {
      tasks: Array<ProjectPlanSnapshotData["content"]["columns"][number]["tasks"][number] & { dueDate?: string }>;
    }>;
  };
};

export interface JobAgreementWizardInitialData {
  title: string;
  description: string;
  budget: number | null;
  estimatedDays: number | null;
  startDate?: string | null;
  postingSubmittedAt?: string | null;
  revisions: number | null;
  deadline: string | null;
  plan: ProjectPlanSnapshotData | null;
  planSource: string;
}

type StoredJobAgreementDraft = {
  schemaVersion: 1;
  savedAt: string;
  step: 0 | 1 | 2;
  title: string;
  description: string;
  budget: string;
  revisions: string;
  startDate: string;
  deadline: string;
  plan: WizardPlan | null;
  contractDocumentName: string | null;
  versionRequestId: string | null;
  versionRequestFingerprint: string | null;
};

function restoreWizardPlan(value: unknown): WizardPlan | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const plan = value as Partial<WizardPlan>;
  if (
    typeof plan.name !== "string" ||
    typeof plan.description !== "string" ||
    !plan.content ||
    !Array.isArray(plan.content.columns)
  ) return undefined;
  for (const column of plan.content.columns) {
    if (
      !column || typeof column.id !== "string" || typeof column.name !== "string" ||
      column.type !== "stage" || !Array.isArray(column.tasks)
    ) return undefined;
    for (const task of column.tasks) {
      if (
        !task || typeof task.id !== "string" || typeof task.title !== "string" ||
        typeof task.description !== "string" ||
        (task.priority !== "low" && task.priority !== "medium" && task.priority !== "high") ||
        (task.expectedDays != null && (!Number.isInteger(task.expectedDays) || task.expectedDays < 1 || task.expectedDays > 3650)) ||
        (task.dueDate != null && !validDate(task.dueDate))
      ) return undefined;
    }
  }
  return plan as WizardPlan;
}

function readStoredDraft(value: unknown): StoredJobAgreementDraft | null {
  try {
    if (!value || typeof value !== "object") return null;
    const draft = value as Partial<StoredJobAgreementDraft>;
    if (
      draft.schemaVersion !== 1 ||
      typeof draft.savedAt !== "string" ||
      ![0, 1, 2].includes(draft.step as number) ||
      typeof draft.title !== "string" ||
      typeof draft.description !== "string" ||
      typeof draft.budget !== "string" ||
      typeof draft.revisions !== "string" ||
      typeof draft.startDate !== "string" ||
      typeof draft.deadline !== "string" ||
      !(draft.contractDocumentName === null || typeof draft.contractDocumentName === "string") ||
      !(draft.versionRequestId === null || typeof draft.versionRequestId === "string") ||
      !(draft.versionRequestFingerprint === null || typeof draft.versionRequestFingerprint === "string")
    ) return null;

    const plan = restoreWizardPlan(draft.plan);
    if (plan === undefined) return null;
    return { ...draft, plan } as StoredJobAgreementDraft;
  } catch {
    return null;
  }
}

const stepLabels = ["Contract Details", "Plan the Work", "Review & Agreement"] as const;

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayDate(): string {
  return localDateString(new Date());
}

function deliveryDaysBetween(start: string, deadline: string): number {
  const startUtc = Date.parse(`${start}T00:00:00Z`);
  const deadlineUtc = Date.parse(`${deadline}T00:00:00Z`);
  return Math.max(1, Math.ceil((deadlineUtc - startUtc) / 86_400_000));
}

function suggestedDeadline(days: number | null, postingSubmittedAt?: string | null): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const postedAt = postingSubmittedAt ? new Date(postingSubmittedAt) : null;
  const date = postedAt && Number.isFinite(postedAt.getTime())
    ? new Date(postedAt.getFullYear(), postedAt.getMonth(), postedAt.getDate())
    : new Date(today);
  if (date < today) date.setTime(today.getTime());
  if (days && Number.isInteger(days) && days > 0) date.setDate(date.getDate() + days);
  return localDateString(date);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year > 0 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function JobAgreementWizard({
  initial,
  onBack,
  onOpenExistingAgreement,
  busy = false,
  conversation,
  draftKey,
  draftUserId,
}: {
  initial: JobAgreementWizardInitialData;
  onBack: () => void;
  onOpenExistingAgreement: (
    proposal: ContractVersionAgreementInput,
    requestId: string,
    contractDocument?: File,
  ) => void | Promise<void>;
  busy?: boolean;
  conversation?: Omit<Parameters<typeof ProjectChatPanel>[0], "className">;
  draftKey: string;
  draftUserId: string;
}) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [budget, setBudget] = useState(String(initial.budget ?? ""));
  const [revisions, setRevisions] = useState(String(initial.revisions ?? 0));
  const [startDate, setStartDate] = useState(() => initial.startDate?.slice(0, 10) || todayDate());
  const [deadline, setDeadline] = useState(() => initial.deadline?.slice(0, 10) || suggestedDeadline(initial.estimatedDays, initial.postingSubmittedAt));
  const [contractDocument, setContractDocument] = useState<File | null>(null);
  const [documentError, setDocumentError] = useState("");
  const [draggingDocument, setDraggingDocument] = useState(false);
  const contractDocumentInput = useRef<HTMLInputElement>(null);
  const versionRequestIdRef = useRef<string | null>(null);
  const versionRequestFingerprintRef = useRef<string | null>(null);
  const [plan, setPlan] = useState<WizardPlan | null>(() => initial.plan ? {
    ...initial.plan,
    name: initial.title,
    description: initial.description,
    content: { ...initial.plan.content, columns: initial.plan.content.columns.map((column) => ({ ...column, tasks: column.tasks.map((task) => ({ ...task })) })) },
  } : null);
  const [editingPlan, setEditingPlan] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(true);
  const [finalConfirmationOpen, setFinalConfirmationOpen] = useState(false);
  const [termsPolicyAccepted, setTermsPolicyAccepted] = useState(false);
  const [agreementReviewed, setAgreementReviewed] = useState(false);
  const [willVerifySavedTerms, setWillVerifySavedTerms] = useState(false);
  const [planPreviewOpen, setPlanPreviewOpen] = useState(false);
  const [openingAgreement, setOpeningAgreement] = useState(false);
  const planSource = initial.planSource;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [noticeError, setNoticeError] = useState(false);

  useEffect(() => {
    let current = true;
    setDraftReady(false);
    void loadContractCreationDraft(draftKey, draftUserId)
      .then((stored) => {
        if (!current || stored === null) return;
        const draft = readStoredDraft(stored);
        if (!draft) {
          setNoticeError(true);
          setNotice("A saved draft could not be read. Your current application details were kept.");
          return;
        }
        setStep(draft.step);
        setTitle(draft.title);
        setDescription(draft.description);
        setBudget(draft.budget);
        setRevisions(draft.revisions);
        setStartDate(draft.startDate);
        setDeadline(draft.deadline);
        setPlan(draft.plan);
        versionRequestIdRef.current = draft.versionRequestId;
        versionRequestFingerprintRef.current = draft.versionRequestFingerprint;
        setNoticeError(false);
        setNotice(`Draft restored from Supabase. Last saved ${new Date(draft.savedAt).toLocaleString()}.${draft.contractDocumentName ? ` Reattach “${draft.contractDocumentName}” if you still want to send it.` : ""}`);
      })
      .catch((cause) => {
        if (!current) return;
        setNoticeError(true);
        setNotice(cause instanceof Error ? cause.message : "Unable to load the saved draft.");
      })
      .finally(() => {
        if (current) setDraftReady(true);
      });
    return () => { current = false; };
  }, [draftKey, draftUserId]);

  function validateDetails() {
    if (!title.trim()) return "Enter a project title.";
    if (!description.trim()) return "Enter a project description.";
    if (!Number.isFinite(Number(budget)) || Number(budget) <= 0) return "Enter a budget greater than zero.";
    if (!revisions.trim() || !Number.isInteger(Number(revisions)) || Number(revisions) < 0) return "Enter a valid revision count.";
    if (!validDate(startDate) || startDate < todayDate()) return "Choose today or a future project start date.";
    if (!validDate(deadline) || deadline < startDate) return "Choose a delivery deadline on or after the project start date.";
    return "";
  }

  async function saveDraftNotice(
    requestId = versionRequestIdRef.current,
    requestFingerprint = versionRequestFingerprintRef.current,
  ): Promise<boolean> {
    if (!draftReady || draftSaving) return false;
    const draft: StoredJobAgreementDraft = {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      step: step as 0 | 1 | 2,
      title,
      description,
      budget,
      revisions,
      startDate,
      deadline,
      plan,
      contractDocumentName: contractDocument?.name ?? null,
      versionRequestId: requestId,
      versionRequestFingerprint: requestFingerprint,
    };
    setDraftSaving(true);
    try {
      await saveContractCreationDraft(draftKey, draftUserId, draft as unknown as Record<string, unknown>);
      setNoticeError(false);
      setNotice(`Draft saved to your WorkSync account at ${new Date(draft.savedAt).toLocaleTimeString()}.${contractDocument ? " The attached document itself is not saved; select it again before sending." : ""}`);
      return true;
    } catch {
      setNoticeError(true);
      setNotice("Draft could not be saved to WorkSync. Check your connection and try again.");
      return false;
    } finally {
      setDraftSaving(false);
    }
  }

  async function openAgreementFlow(): Promise<boolean> {
    setError("");
    const validation = validateDetails();
    if (validation) {
      setError(validation);
      return false;
    }
    if (!plan) {
      setError("Add a complete work plan before continuing.");
      return false;
    }
    const proposal: ContractVersionAgreementInput = {
      budget: Number(budget),
      deliveryDays: deliveryDaysBetween(startDate, deadline),
      revisionsCount: Number(revisions),
      projectTitle: title,
      description,
      startDate,
      deadline,
      plan,
    };
    const fingerprint = JSON.stringify(proposal);
    if (!versionRequestIdRef.current || versionRequestFingerprintRef.current !== fingerprint) {
      if (!globalThis.crypto?.randomUUID) {
        setError("This browser cannot create a retry-safe save request. Update your browser and try again.");
        return false;
      }
      versionRequestIdRef.current = globalThis.crypto.randomUUID();
      versionRequestFingerprintRef.current = fingerprint;
    }
    const requestId = versionRequestIdRef.current;
    setOpeningAgreement(true);
    try {
      if (!(await saveDraftNotice(requestId, fingerprint))) {
        throw new Error("The draft must be saved before its terms can be sent for signature.");
      }
      await onOpenExistingAgreement(proposal, requestId, contractDocument ?? undefined);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send the contract document.");
      return false;
    } finally {
      setOpeningAgreement(false);
    }
  }

  function setContractDocumentFile(selected: File | null) {
    if (selected && !/\.(pdf|doc|docx)$/i.test(selected.name)) {
      setDocumentError("Choose a PDF or Word document.");
      setContractDocument(null);
      if (contractDocumentInput.current) contractDocumentInput.current.value = "";
      return;
    }
    setDocumentError("");
    setContractDocument(selected);
  }

  function updatePlanColumn(columnId: string, update: (column: WizardPlan["content"]["columns"][number]) => WizardPlan["content"]["columns"][number]) {
    setPlan((current) => current ? {
      ...current,
      content: {
        ...current.content,
        columns: current.content.columns.map((column) => column.id === columnId ? update(column) : column),
      },
    } : current);
  }

  function updateTask(columnId: string, taskId: string, patch: Partial<WizardPlan["content"]["columns"][number]["tasks"][number]>) {
    setPlan((current) => current ? ({
      ...current,
      content: { ...current.content, columns: current.content.columns.map((column) => column.id === columnId
        ? { ...column, tasks: column.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task) }
        : column) },
    }) : current);
  }

  function movePlanTask(sourceColumnId: string, targetColumnId: string, taskId: string, targetIndex: number) {
    setPlan((current) => {
      if (!current) return current;
      const columns = current.content.columns.map((column) => ({ ...column, tasks: [...column.tasks] }));
      const source = columns.find((column) => column.id === sourceColumnId);
      const target = columns.find((column) => column.id === targetColumnId);
      const sourceIndex = source?.tasks.findIndex((task) => task.id === taskId) ?? -1;
      // Done is reserved for server-confirmed completion after client approval.
      if (!source || !target || sourceIndex < 0) return current;
      const [task] = source.tasks.splice(sourceIndex, 1);
      const adjustedIndex = sourceColumnId === targetColumnId && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      target.tasks.splice(Math.max(0, Math.min(adjustedIndex, target.tasks.length)), 0, task);
      return { ...current, content: { ...current.content, columns } };
    });
  }

  return <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-5 text-foreground sm:px-6 lg:px-8">
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Back to projects"><ArrowLeft/></Button><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Create Contract</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{stepLabels[step]}</h1></div></div></header>

    <ol aria-label="Contract creation progress" className="grid grid-cols-3 gap-2 sm:gap-5">{stepLabels.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={`border-t-2 pt-3 ${index <= step ? "border-primary" : "border-border"}`}><div className="flex items-center gap-2"><span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm ${index < step ? "bg-primary text-primary-foreground" : index === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{index < step ? <Check className="size-4"/> : index + 1}</span><span className={`text-xs font-medium sm:text-sm ${index === step ? "text-foreground" : "text-muted-foreground"}`}>{label}</span></div><p className="mt-1 pl-9 text-xs text-muted-foreground">{index === 0 ? "Budget, revisions, deadline" : index === 1 ? "Stages and tasks" : "Preview contract"}</p></li>)}</ol>

    {step === 0 && <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.95fr)]">
      <Card className="border-border/80 bg-card/70"><CardHeader><CardTitle>Contract Details</CardTitle><p className="text-sm text-muted-foreground">Define the basic terms of your agreement.</p></CardHeader><CardContent className="space-y-5">
        <Field id="wizard-title" label="Project title" required error={error && !title.trim() ? "Project title is required." : ""}><Input id="wizard-title" value={title} onChange={(event) => { const next = event.target.value; setTitle(next); setPlan((current) => current ? { ...current, name: next } : current); }} placeholder="Project title" aria-invalid={!!error && !title.trim()}/></Field>
        <Field id="wizard-description" label="Description" required error={error && !description.trim() ? "Description is required." : ""}><Textarea id="wizard-description" value={description} onChange={(event) => { const next = event.target.value; setDescription(next); setPlan((current) => current ? { ...current, description: next } : current); }} placeholder="Describe the agreed scope and intended outcome…" className="min-h-24" aria-invalid={!!error && !description.trim()}/></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field id="wizard-budget" label="Budget (PHP)" required error={error && (!Number.isFinite(Number(budget)) || Number(budget) <= 0) ? "Enter a positive budget." : ""}><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₱</span><Input id="wizard-budget" type="number" min="1" step="0.01" className="pl-8" value={budget} onChange={(event) => setBudget(event.target.value)}/></div></Field><Field id="wizard-revisions" label="Included revisions" required error={error && (!revisions.trim() || !Number.isInteger(Number(revisions)) || Number(revisions) < 0) ? "Enter zero or more revisions." : ""}><Input id="wizard-revisions" type="number" min="0" step="1" value={revisions} onChange={(event) => setRevisions(event.target.value)}/></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field id="wizard-start-date" label="Project start date" required error={error && (!validDate(startDate) || startDate < todayDate()) ? "Choose today or a future project start date." : ""}><div className="relative"><CalendarDays className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input id="wizard-start-date" type="date" min={todayDate()} className="pl-10" value={startDate} onChange={(event) => { if (event.target.value >= todayDate()) setStartDate(event.target.value); }}/></div></Field><Field id="wizard-deadline" label="Delivery deadline" required error={error && (!validDate(deadline) || deadline < startDate) ? "Choose a delivery deadline on or after the project start date." : ""}><div className="relative"><CalendarDays className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input id="wizard-deadline" type="date" min={startDate} className="pl-10" value={deadline} onChange={(event) => { if (event.target.value >= startDate) setDeadline(event.target.value); }}/></div>{initial.estimatedDays && !initial.deadline ? <p className="text-xs text-muted-foreground">Suggested from the marketplace post date and the submitted estimate of {initial.estimatedDays} days.</p> : <p className="text-xs text-muted-foreground">Choose a deadline on or after the project start date.</p>}</Field></div>
        <Field id="contract-document" label="Attach your contract document (optional)"><input ref={contractDocumentInput} id="contract-document" type="file" className="sr-only" aria-label="Choose a PDF or Word contract document" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setContractDocumentFile(event.target.files?.[0] ?? null)}/><div onDragEnter={(event) => { event.preventDefault(); setDraggingDocument(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingDocument(false); }} onDrop={(event) => { event.preventDefault(); setDraggingDocument(false); setContractDocumentFile(event.dataTransfer.files.item(0)); }} className={`flex min-h-[76px] items-center gap-3 rounded-lg border px-4 py-3 transition ${draggingDocument ? "border-primary bg-primary/10" : "border-border/80 bg-muted/30"}`}><button type="button" aria-label="Drag and drop a PDF, DOC, or DOCX file here, or click to browse" onClick={() => contractDocumentInput.current?.click()} className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><FileUp className="size-6 shrink-0 text-primary"/><span className="max-w-[85%]">{contractDocument ? <><span className="block truncate text-xs font-medium text-foreground">{contractDocument.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{(contractDocument.size / (1024 * 1024)).toFixed(2)} MB · click to replace</span></> : <><span className="block text-xs font-medium text-foreground">Drag &amp; drop your file or click to browse</span><span className="mt-1 block text-[10px] text-muted-foreground">Supported: PDF, DOC, DOCX</span></>}</span></button>{contractDocument && <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Remove contract document" onClick={() => { setContractDocumentFile(null); if (contractDocumentInput.current) contractDocumentInput.current.value = ""; }}><X className="size-4"/></Button>}</div>{documentError && <p role="alert" className="text-xs text-destructive">{documentError}</p>}<p className="text-xs text-muted-foreground">Attach a custom contract document for the other party to review in your agreement conversation.</p></Field>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={!draftReady || draftSaving} onClick={() => void saveDraftNotice()}>{draftSaving ? "Saving…" : "Save draft"}</Button><Button type="button" onClick={() => { const validation = validateDetails(); setError(validation); setNotice(""); if (!validation) setStep(1); }}>Continue to planner <ArrowRight/></Button></div>
      </CardContent></Card>
      <Card className="border-border/80 bg-card/70"><CardHeader><CardTitle>Contract Summary</CardTitle></CardHeader><CardContent className="space-y-5"><SummaryRow icon={<FileText/>} label="Project" value={title || "Not set"}/><SummaryRow icon={<Wallet/>} label="Budget" value={budget && Number(budget) > 0 ? `PHP ${Number(budget).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "Not set"}/><SummaryRow icon={<RotateCcw/>} label="Included revisions" value={revisions || "Not set"}/><SummaryRow icon={<CalendarDays/>} label="Delivery deadline" value={deadline ? new Date(`${deadline}T00:00:00`).toLocaleDateString() : "Not set"}/><div className="border-t pt-5"><h3 className="font-semibold">What’s next?</h3><p className="mt-2 text-sm text-muted-foreground">Plan the work by adding stages and tasks or choosing a saved plan.</p><ol className="mt-4 space-y-3 text-sm">{["Set up the project stages", "Review tasks and details", "Review the complete agreement"].map((item, index) => <li key={item} className="flex items-center gap-3"><span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{index + 1}</span>{item}</li>)}</ol></div></CardContent></Card>
    </div>}

    {step === 1 && <div className={conversation && conversationOpen ? "grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.75fr)] xl:items-stretch" : ""}><Card className="flex h-[min(75vh,760px)] min-h-[480px] flex-col border-border/80 bg-card/70"><CardHeader className="flex flex-wrap items-start justify-between gap-3 sm:flex-row"><div><CardTitle>Plan the Work</CardTitle><p className="mt-1 text-sm text-muted-foreground">Review the plan attached by the freelancer to this application.</p></div><div className="flex flex-col items-end gap-2"><Badge variant="outline">{planSource}</Badge>{plan && <Button type="button" variant="outline" onClick={() => setEditingPlan((value) => !value)}><Pencil/>{editingPlan ? "Done editing" : "Edit plan"}</Button>}{conversation && <Button type="button" variant="outline" aria-expanded={conversationOpen} onClick={() => setConversationOpen((open) => !open)}><MessageSquare/>{conversationOpen ? "Hide conversation" : "Show conversation"}</Button>}</div></CardHeader><CardContent className="min-h-0 flex-1 space-y-5 overflow-y-auto">{plan ? <><div className="space-y-2"><h3 className="font-semibold">{plan.name}</h3><p className="text-sm text-muted-foreground">{plan.description || "No plan description."}</p></div>{editingPlan ? <PlanEditor value={plan} deadline={deadline} onUpdateColumn={updatePlanColumn} onUpdateTask={updateTask} onMoveTask={movePlanTask} onUpdateDetails={(patch) => setPlan((current) => current ? { ...current, ...patch } : current)} /> : <PlanColumns value={plan}/>}</> : <div className="rounded-xl border border-dashed p-12 text-center"><FileText className="mx-auto size-8 text-muted-foreground"/><h3 className="mt-3 font-medium">No attached work plan</h3><p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">This application does not include a freelancer-submitted plan. A different saved plan cannot be selected here.</p></div>}<p className="rounded-lg border border-border/80 bg-muted/20 p-3 text-sm text-muted-foreground">Edits in this step apply only to this contract proposal; they do not change the freelancer’s reusable Project Planner template. Use Save draft to keep your proposal in your WorkSync account.</p><div className="flex flex-col-reverse justify-between gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={() => { setError(""); setStep(0); }}>Back to contract details</Button><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={!draftReady || draftSaving} onClick={() => void saveDraftNotice()}>{draftSaving ? "Saving…" : "Save draft"}</Button><Button type="button" disabled={!plan} onClick={() => { setError(""); setEditingPlan(false); setStep(2); }}>Continue to review <ArrowRight/></Button></div></div></CardContent></Card>{conversation && <ProjectChatPanel {...conversation} className={`${conversationOpen ? "h-[min(75vh,760px)] min-h-[480px]" : "hidden"}`} />}</div>}

    {step === 2 && <Card className="border-border/80 bg-card/70"><CardHeader><CardTitle>Review & Agreement</CardTitle><p className="text-sm text-muted-foreground">Review the prepared details and plan before final confirmation.</p></CardHeader><CardContent className="space-y-5"><section className="rounded-xl border p-4"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{description}</p><div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-4"><InlineSummaryRow label="Budget" value={`PHP ${Number(budget).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}/><InlineSummaryRow label="Included revisions" value={revisions}/><InlineSummaryRow label="Project start" value={new Date(`${startDate}T00:00:00`).toLocaleDateString()}/><InlineSummaryRow label="Delivery deadline" value={new Date(`${deadline}T00:00:00`).toLocaleDateString()}/></div>{contractDocument && <div className="mt-4 flex items-center gap-2 border-t pt-4 text-sm"><Paperclip className="size-4 text-muted-foreground"/><span>{contractDocument.name}</span><span className="text-xs text-muted-foreground">Will be sent in the agreement conversation for review; it is not automatically part of the signed terms.</span></div>}</section>{plan && <Card className="border-border/80 bg-card/50"><CardHeader className="pb-3"><CardTitle className="text-base">{plan.name}</CardTitle>{plan.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{plan.description}</p>}</CardHeader><CardContent className="pt-0"><PlanColumns value={plan} fit/></CardContent></Card>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex flex-col-reverse justify-between gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={() => setStep(1)}>Back to planner</Button><Button type="button" disabled={busy || openingAgreement} onClick={() => { setTermsPolicyAccepted(false); setAgreementReviewed(false); setWillVerifySavedTerms(false); setFinalConfirmationOpen(true); }}>Final confirmation</Button></div></CardContent></Card>}

    {step === 2 && <Dialog open={finalConfirmationOpen} onOpenChange={(open) => { setFinalConfirmationOpen(open); if (!open) { setTermsPolicyAccepted(false); setAgreementReviewed(false); setWillVerifySavedTerms(false); } }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Final proposal confirmation</DialogTitle><DialogDescription>Review the project terms and plan before continuing to the existing contract view.</DialogDescription></DialogHeader><section className="rounded-lg border p-4"><ul className="space-y-2 text-sm"><li><span className="font-semibold">Project name:</span> {title}</li><li><span className="font-semibold">Description:</span> <span className="line-clamp-2 text-muted-foreground">{description}</span></li><li><span className="font-semibold">Budget:</span> PHP {Number(budget).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</li><li><span className="font-semibold">Included revisions:</span> {revisions}</li><li><span className="font-semibold">Project start:</span> {new Date(`${startDate}T00:00:00`).toLocaleDateString()}</li><li><span className="font-semibold">Delivery deadline:</span> {new Date(`${deadline}T00:00:00`).toLocaleDateString()}</li>{contractDocument && <li><span className="font-semibold">Custom contract (optional):</span> {contractDocument.name}</li>}</ul></section>{plan && <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3"><div className="min-w-0"><h3 className="truncate text-sm font-medium">{plan.name}</h3><p className="text-xs text-muted-foreground">{plan.content.columns.length} stages · {plan.content.columns.reduce((count, column) => count + column.tasks.length, 0)} tasks</p></div><Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setPlanPreviewOpen(true)}><Eye/>View full plan</Button></section>}<section className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold">Terms and agreement</h3><label className="flex cursor-pointer items-start gap-3 text-sm"><Checkbox checked={termsPolicyAccepted} onCheckedChange={(checked) => setTermsPolicyAccepted(checked === true)} aria-label="I agree to WorkSync Terms and Privacy Policy" className="mt-0.5 size-5"/><span>I agree to WorkSync&#39;s <u className="underline underline-offset-2">Terms and Privacy Policy</u>.</span></label><label className="flex cursor-pointer items-start gap-3 text-sm"><Checkbox checked={agreementReviewed} onCheckedChange={(checked) => setAgreementReviewed(checked === true)} aria-label="Confirm that I reviewed the agreement terms above" className="mt-0.5 size-5"/><span>I confirm that I have reviewed the agreement terms above.</span></label><label className="flex cursor-pointer items-start gap-3 text-sm"><Checkbox checked={willVerifySavedTerms} onCheckedChange={(checked) => setWillVerifySavedTerms(checked === true)} aria-label="Confirm that I will verify the saved contract terms before signing" className="mt-0.5 size-5"/><span>I will verify the saved contract terms before signing.</span></label></section><DialogFooter><Button type="button" disabled={!(termsPolicyAccepted && agreementReviewed && willVerifySavedTerms) || busy || openingAgreement} onClick={() => void openAgreementFlow().then((opened) => { if (opened) setFinalConfirmationOpen(false); })}>{busy || openingAgreement ? "Opening…" : "Continue to contract view"}</Button></DialogFooter></DialogContent></Dialog>}{plan && <ProjectPlanSnapshotPreview plan={plan} open={planPreviewOpen} onOpenChange={setPlanPreviewOpen}/> }

    <section className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card/50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Contract drafts are saved to your WorkSync account</p><p className="mt-1 text-sm text-muted-foreground">Save draft to continue later from this account. Uploaded documents must be selected again if you leave this page.</p>{notice && <p role={noticeError ? "alert" : "status"} className={`mt-2 text-sm ${noticeError ? "text-destructive" : "text-emerald-700 dark:text-emerald-300"}`}>{notice}</p>}</div><div className="flex gap-2"><Button type="button" variant="outline" asChild><Link href="/home/projects">View projects</Link></Button></div></section>
  </main>;
}

function Field({ id, label, required, error, children }: { id: string; label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label htmlFor={id} className="text-sm font-medium">{label}{required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}</label>{children}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}

function SummaryRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2.5 text-sm text-muted-foreground">{icon && <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">{icon}</span>}{label}</span><span className="text-right text-sm font-medium">{value}</span></div>;
}

function InlineSummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}

function PlanColumns({ value, fit = false }: { value: ProjectPlanSnapshotData; fit?: boolean }) {
  const accents = ["border-emerald-400/60", "border-sky-300/50", "border-white/20"];
  return <div className={fit ? "grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" : "overflow-x-auto"}><div className={fit ? "contents" : "flex min-w-max gap-3 pb-2"}>{value.content.columns.map((column, index) => <section key={column.id} aria-label={`${column.name}, ${column.tasks.length} tasks`} className={`${fit ? "min-w-0 w-full" : "w-72"} rounded-xl border border-white/10 border-t-2 bg-[#151b22] p-4 ${accents[index % accents.length]}`}><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{column.name}</h3><Badge variant="outline" className="border-white/10 text-slate-300">{column.tasks.length}</Badge></div>{column.tasks.length ? <div className="mt-3 space-y-2">{column.tasks.map((task) => <article key={task.id} className="rounded-lg border border-white/10 bg-[#1a2129] p-3"><h4 className="text-sm font-medium">{task.title}</h4>{task.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-400">{task.description}</p>}<Badge variant="outline" className="mt-2 border-white/10 text-slate-300">{task.priority} priority</Badge></article>)}</div> : <p className="mt-4 text-sm text-slate-500">No tasks in this stage.</p>}</section>)}</div></div>;
}

function PlanEditor({ value, deadline, onUpdateColumn, onUpdateTask, onMoveTask, onUpdateDetails }: {
  value: WizardPlan;
  deadline: string;
  onUpdateColumn: (columnId: string, update: (column: WizardPlan["content"]["columns"][number]) => WizardPlan["content"]["columns"][number]) => void;
  onUpdateTask: (columnId: string, taskId: string, patch: Partial<WizardPlan["content"]["columns"][number]["tasks"][number]>) => void;
  onMoveTask: (sourceColumnId: string, targetColumnId: string, taskId: string, targetIndex: number) => void;
  onUpdateDetails: (patch: Pick<ProjectPlanSnapshotData, "name" | "description">) => void;
}) {
  const [editingTask, setEditingTask] = useState<{ columnId: string; taskId: string } | null>(null);
  return <section aria-label="Edit attached plan" className="space-y-4 rounded-xl border border-border/80 bg-muted/15 p-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="attached-plan-name" label="Plan name"><Input id="attached-plan-name" maxLength={120} value={value.name} onChange={(event) => onUpdateDetails({ name: event.target.value, description: value.description })}/></Field>
      <Field id="attached-plan-description" label="Plan description"><Textarea id="attached-plan-description" maxLength={1500} value={value.description} onChange={(event) => onUpdateDetails({ name: value.name, description: event.target.value })} className="min-h-10"/></Field>
    </div>
    <div className="overflow-x-auto pb-2"><div className="flex min-w-max items-start gap-3">{value.content.columns.map((column, columnIndex) => <section key={column.id} aria-label={`Edit ${column.name} stage`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const payload = event.dataTransfer.getData("application/worksync-contract-plan-task"); if (!payload) return; event.preventDefault(); event.stopPropagation(); try { const dragged = JSON.parse(payload) as { sourceColumnId: string; taskId: string }; onMoveTask(dragged.sourceColumnId, column.id, dragged.taskId, column.tasks.length); } catch { /* Ignore malformed drag payloads. */ } }} className={`w-[19rem] shrink-0 rounded-xl border border-border/80 border-t-2 bg-muted/25 p-3 ${columnIndex % 3 === 0 ? "border-t-emerald-400/60" : columnIndex % 3 === 1 ? "border-t-sky-300/50" : "border-t-primary/40"}`}>
      <header className="mb-3 flex items-center gap-2"><Input aria-label={`${column.name} stage name`} maxLength={80} value={column.name} onChange={(event) => onUpdateColumn(column.id, (current) => ({ ...current, name: event.target.value }))} className="h-9 border-transparent bg-transparent px-2 font-semibold shadow-none focus-visible:border-input"/><Badge variant="secondary" className="shrink-0">{column.tasks.length}</Badge></header>
      <div className="space-y-2">{column.tasks.map((task, taskIndex) => <button key={task.id} type="button" draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/worksync-contract-plan-task", JSON.stringify({ sourceColumnId: column.id, taskId: task.id })); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const payload = event.dataTransfer.getData("application/worksync-contract-plan-task"); if (!payload) return; event.preventDefault(); event.stopPropagation(); try { const dragged = JSON.parse(payload) as { sourceColumnId: string; taskId: string }; onMoveTask(dragged.sourceColumnId, column.id, dragged.taskId, taskIndex); } catch { /* Ignore malformed drag payloads. */ } }} onClick={() => setEditingTask({ columnId: column.id, taskId: task.id })} className="block w-full cursor-pointer rounded-lg border border-border/70 bg-card p-3 text-left shadow-sm transition hover:border-primary/50 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-start justify-between gap-2"><span className="font-medium">{task.title || "Untitled task"}</span><span className="flex items-center gap-1"><GripVertical className="size-4 shrink-0 text-muted-foreground" aria-label="Drag to reorder or move task"/><Pencil className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/></span></span>
        {task.description && <span className="mt-2 block line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{task.description}</span>}
        <span className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">{task.priority} priority</Badge>{task.expectedDays != null && <span>Estimated {task.expectedDays} {task.expectedDays === 1 ? "day" : "days"}</span>}{task.dueDate && <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5"/>{new Date(`${task.dueDate}T12:00:00`).toLocaleDateString()}</span>}</span>
      </button>)}</div>
      {column.tasks.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No tasks in this stage</p>}
    </section>)}</div></div>
    <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
      <DialogContent>
        {editingTask && (() => {
          const task = value.content.columns.find((item) => item.id === editingTask.columnId)?.tasks.find((item) => item.id === editingTask.taskId);
          if (!task) return null;
          return <>
            <DialogHeader><DialogTitle>Edit task</DialogTitle><DialogDescription>Update this proposed task. Its due date applies to this contract plan only.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <Field id="wizard-task-title" label="Task title"><Input id="wizard-task-title" maxLength={160} value={task.title} onChange={(event) => onUpdateTask(editingTask.columnId, task.id, { title: event.target.value })}/></Field>
              <Field id="wizard-task-description" label="Description"><Textarea id="wizard-task-description" maxLength={1000} value={task.description} onChange={(event) => onUpdateTask(editingTask.columnId, task.id, { description: event.target.value })}/></Field>
              <Field id="wizard-task-priority" label="Priority"><select id="wizard-task-priority" value={task.priority} onChange={(event) => onUpdateTask(editingTask.columnId, task.id, { priority: event.target.value as typeof task.priority })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
              <Field id="wizard-task-estimated-days" label="Estimated days"><Input id="wizard-task-estimated-days" type="number" min={1} max={3650} step={1} inputMode="numeric" required value={task.expectedDays ?? ""} onKeyDown={(event) => { if (event.key === "." || event.key === ",") event.preventDefault(); }} onChange={(event) => { const raw = event.target.value; if (raw === "") { onUpdateTask(editingTask.columnId, task.id, { expectedDays: undefined }); return; } const expectedDays = Number(raw); if (Number.isInteger(expectedDays) && expectedDays >= 1 && expectedDays <= 3650) onUpdateTask(editingTask.columnId, task.id, { expectedDays }); }}/></Field>
              <Field id="wizard-task-due-date" label="Due date"><Input id="wizard-task-due-date" type="date" max={deadline} value={task.dueDate ?? ""} onChange={(event) => onUpdateTask(editingTask.columnId, task.id, { dueDate: event.target.value || undefined })}/></Field>
            </div>
            <DialogFooter><Button type="button" disabled={!Number.isInteger(task.expectedDays) || (task.expectedDays ?? 0) < 1 || (task.expectedDays ?? 0) > 3650} onClick={() => setEditingTask(null)}>Done</Button></DialogFooter>
          </>;
        })()}
      </DialogContent>
    </Dialog>
  </section>;
}
