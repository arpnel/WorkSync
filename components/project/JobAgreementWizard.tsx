"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Eye, FileText, FileUp, GripVertical, MessageSquare, Paperclip, Pencil, Plus, RotateCcw, Wallet, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WorkSyncLegalDialog, type WorkSyncLegalDocument } from "@/components/project/WorkSyncLegalDialog";
import { openSubscriptionLimitDialog } from "@/services/subscriptions/subscriptionLimitDialog";
import { ProjectChatPanel } from "@/components/project/ProjectChatPanel";
import { ProjectPlanSnapshotPreview } from "@/components/project/ProjectPlanSnapshotPreview";
import { ProjectPlanProposalAttachment } from "@/components/project/ProjectPlanProposalAttachment";
import type { ProjectPlanSnapshotData } from "@/services/project/projectPlanSnapshot";
import type { ContractVersionAgreementInput, ContractVersionMilestoneInput } from "@/services/project/projectWorkspaceService";
import type { JobMilestonePlanAgreement } from "@/services/project/jobMilestonePlanAgreementService";
import type { JobWorkPlanAgreement } from "@/services/project/jobWorkPlanAgreementService";
import type { JobBasicTerms } from "@/services/project/jobBasicTermsAgreementService";
import {
  loadContractCreationDraft,
  saveContractCreationDraft,
} from "@/services/project/contractCreationDraftService";

type WizardPlan = Omit<ProjectPlanSnapshotData, "content"> & {
  content: Omit<ProjectPlanSnapshotData["content"], "columns"> & {
    columns: Array<Omit<ProjectPlanSnapshotData["content"]["columns"][number], "tasks"> & {
      tasks: Array<ProjectPlanSnapshotData["content"]["columns"][number]["tasks"][number] & { dueDate?: string | null; milestoneId?: string | null }>;
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
  projectType?: "standard" | "milestone";
}

type StoredJobAgreementDraft = {
  schemaVersion: 1 | 2;
  savedAt: string;
  step: 0 | 1 | 2 | 3;
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
      (column.type !== "stage" && column.type !== "done") || !Array.isArray(column.tasks)
    ) return undefined;
    for (const task of column.tasks) {
      if (
        !task || typeof task.id !== "string" || typeof task.title !== "string" ||
        typeof task.description !== "string" ||
        (task.priority !== "low" && task.priority !== "medium" && task.priority !== "high") ||
        (task.expectedDays != null && (!Number.isInteger(task.expectedDays) || task.expectedDays < 1 || task.expectedDays > 3650)) ||
        (task.dueDate != null && !validDate(task.dueDate))
        || (task.milestoneId != null && typeof task.milestoneId !== "string")
      ) return undefined;
    }
  }
    return normalizeWizardPlan(plan as ProjectPlanSnapshotData);
}

function normalizeWizardPlan(value: ProjectPlanSnapshotData | null): WizardPlan | null {
  if (!value) return null;
  return {
    ...value,
    content: {
      ...value.content,
      columns: value.content.columns.map((column) => ({
        ...column,
        tasks: column.tasks.map((task) => ({
          ...task,
          expectedDays: task.expectedDays ?? undefined,
          dueDate: task.dueDate ?? undefined,
          milestoneId: task.milestoneId ?? undefined,
        })),
      })),
    },
  } as WizardPlan;
}

const basicTermLabels: Record<keyof JobBasicTerms, string> = {
  projectTitle: "Project title",
  description: "Description",
  budget: "Budget",
  revisionsCount: "Included revisions",
  startDate: "Start date",
  deadline: "Delivery deadline",
};

function formatBasicTerm(field: keyof JobBasicTerms, value: string | number) {
  if (field === "budget")
    return `PHP ${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
  if (field === "revisionsCount") return `${value} revisions`;
  return String(value);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(
      Object.entries(item as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)),
    );
  });
}

function formatMilestoneValue(field: "title" | "description" | "amount" | "dueDate" | "taskIds", milestone: ContractVersionMilestoneInput) {
  if (field === "amount") return `PHP ${milestone.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
  if (field === "dueDate") return milestone.dueDate || "No deadline";
  if (field === "taskIds") return `${milestone.taskIds?.length ?? 0} assigned tasks`;
  return milestone[field] || "Empty";
}

function milestonePlanChanges(previous: ContractVersionMilestoneInput[], current: ContractVersionMilestoneInput[]) {
  const changes: string[] = [];
  const currentById = new Map(current.map((item) => [item.id, item]));
  const previousById = new Map(previous.map((item) => [item.id, item]));
  for (const oldItem of previous) {
    const nextItem = currentById.get(oldItem.id);
    if (!nextItem) {
      changes.push(`Removed milestone: ${oldItem.title}`);
      continue;
    }
    for (const field of ["title", "description", "amount", "dueDate", "taskIds"] as const) {
      if (JSON.stringify(oldItem[field]) !== JSON.stringify(nextItem[field])) {
        changes.push(`${nextItem.title}: ${field === "taskIds" ? "assigned tasks" : field} changed from ${formatMilestoneValue(field, oldItem)} to ${formatMilestoneValue(field, nextItem)}`);
      }
    }
    if (oldItem.displayOrder !== nextItem.displayOrder)
      changes.push(`${nextItem.title}: stage order changed from ${oldItem.displayOrder} to ${nextItem.displayOrder}`);
  }
  for (const item of current) {
    if (!previousById.has(item.id)) changes.push(`Added milestone: ${item.title}`);
  }
  return changes;
}

function workPlanChanges(
  previous: ProjectPlanSnapshotData | null,
  current: ProjectPlanSnapshotData,
): string[] {
  if (!previous) {
    const stages = current.content.columns.filter((column) => column.type === "stage");
    const tasks = stages.reduce((count, column) => count + column.tasks.length, 0);
    return [`Attached ${current.name} with ${stages.length} ${stages.length === 1 ? "stage" : "stages"} and ${tasks} ${tasks === 1 ? "task" : "tasks"}.`];
  }
  previous = normalizeWizardPlan(previous);
  if (!previous) return [];
  const changes: string[] = [];
  if (previous.name !== current.name)
    changes.push(`Plan name changed from â€œ${previous.name}â€ to â€œ${current.name}â€.`);
  if (previous.description !== current.description)
    changes.push("Plan description changed.");

  const previousStages = previous.content.columns.filter((column) => column.type === "stage");
  const currentStages = current.content.columns.filter((column) => column.type === "stage");
  const previousStageById = new Map(previousStages.map((column, index) => [column.id, { column, index }]));
  const currentStageById = new Map(currentStages.map((column, index) => [column.id, { column, index }]));
  for (const [id, { column: oldStage, index: oldIndex }] of previousStageById) {
    const next = currentStageById.get(id);
    if (!next) {
      changes.push(`Stage removed: ${oldStage.name}.`);
      for (const task of oldStage.tasks) changes.push(`Task removed: ${task.title} (${oldStage.name}).`);
      continue;
    }
    if (oldStage.name !== next.column.name)
      changes.push(`Stage renamed from â€œ${oldStage.name}â€ to â€œ${next.column.name}â€.`);
    if (oldIndex !== next.index)
      changes.push(`Stage moved: ${next.column.name}.`);
    const oldTasks = new Map(oldStage.tasks.map((task) => [task.id, task]));
    const nextTasks = new Map(next.column.tasks.map((task) => [task.id, task]));
    for (const [taskId, task] of oldTasks) {
      const updated = nextTasks.get(taskId);
      if (!updated) {
        changes.push(`Task removed: ${task.title} (${oldStage.name}).`);
        continue;
      }
      if (task.title !== updated.title)
        changes.push(`Task renamed from â€œ${task.title}â€ to â€œ${updated.title}â€.`);
      if (task.description !== updated.description)
        changes.push(`Task description changed: ${updated.title}.`);
      if (task.priority !== updated.priority)
        changes.push(`Task priority changed: ${updated.title}.`);
      if (task.expectedDays !== updated.expectedDays)
        changes.push(`Task estimate changed: ${updated.title}.`);
      if (task.dueDate !== updated.dueDate)
        changes.push(`Task due date changed: ${updated.title}.`);
      if (task.milestoneId !== updated.milestoneId)
        changes.push(`Task milestone assignment changed: ${updated.title}.`);
    }
    for (const [taskId, task] of nextTasks) {
      if (!oldTasks.has(taskId)) changes.push(`Task added: ${task.title} (${next.column.name}).`);
    }
  }
  for (const [id, { column }] of currentStageById) {
    if (!previousStageById.has(id)) {
      changes.push(`Stage added: ${column.name}.`);
      for (const task of column.tasks) changes.push(`Task added: ${task.title} (${column.name}).`);
    }
  }
  return changes;
}

function readStoredDraft(value: unknown): StoredJobAgreementDraft | null {
  try {
    if (!value || typeof value !== "object") return null;
    const draft = value as Partial<StoredJobAgreementDraft>;
    if (
      (draft.schemaVersion !== 1 && draft.schemaVersion !== 2) ||
      typeof draft.savedAt !== "string" ||
      ![0, 1, 2, 3].includes(draft.step as number) ||
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

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type MilestoneTaskRef = { id: string; title: string; description: string; stage?: string };

function findTaskForMilestone(milestone: ContractVersionMilestoneInput, tasks: readonly MilestoneTaskRef[]): MilestoneTaskRef | undefined {
  const assignedIds = new Set(milestone.taskIds ?? []);
  return tasks.find((task) => assignedIds.has(task.id));
}

function findMilestoneForTask(task: MilestoneTaskRef, milestones: readonly ContractVersionMilestoneInput[]): ContractVersionMilestoneInput | undefined {
  return milestones.find((milestone) => milestone.taskIds?.includes(task.id));
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

function taskExceedsContractTimeline(
  task: { expectedDays?: number; dueDate?: string | null },
  startDate: string,
  deadline: string,
): boolean {
  if (!validDate(startDate) || !validDate(deadline) || deadline < startDate)
    return false;
  const availableDays = deliveryDaysBetween(startDate, deadline);
  return (
    (task.expectedDays != null && task.expectedDays > availableDays) ||
    Boolean(task.dueDate && task.dueDate > deadline)
  );
}

export function JobAgreementWizard({
  initial,
  clientName,
  freelancerName,
  onBack,
  onOpenExistingAgreement,
  busy = false,
  conversation,
  conversationError,
  agreementStatus,
  basicAgreementStatus,
  onAgreeBasics,
  workPlanAgreementStatus,
  onAgreeWorkPlan,
  milestoneAgreementStatus,
  onAgreeMilestonePlan,
  onAgree,
  draftKey,
  draftUserId,
  contractDetailsFooter,
}: {
  initial: JobAgreementWizardInitialData;
  clientName?: string;
  freelancerName?: string;
  onBack: () => void;
  onOpenExistingAgreement: (
    proposal: ContractVersionAgreementInput,
    requestId: string,
    contractDocument?: File,
  ) => void | Promise<void>;
  busy?: boolean;
  conversation?: Omit<Parameters<typeof ProjectChatPanel>[0], "className">;
  conversationError?: string;
  agreementStatus?: {
    currentParty: "client" | "freelancer";
    clientAgreed: boolean;
    freelancerAgreed: boolean;
    isNew: boolean;
    hasPastMilestoneDate: boolean;
    updating: boolean;
  };
  basicAgreementStatus?: {
    currentParty: "client" | "freelancer";
    clientAgreed: boolean;
    freelancerAgreed: boolean;
    terms: JobBasicTerms | null;
    previousTerms?: JobBasicTerms | null;
    changedFields?: (keyof JobBasicTerms)[];
    changedBy?: "client" | "freelancer" | null;
    updating: boolean;
    error?: string;
  };
  workPlanAgreementStatus?: JobWorkPlanAgreement & {
    currentParty: "client" | "freelancer";
    updating: boolean;
    error?: string;
  };
  onAgreeWorkPlan?: (plan: ProjectPlanSnapshotData) => Promise<JobWorkPlanAgreement>;
  milestoneAgreementStatus?: JobMilestonePlanAgreement & {
    currentParty: "client" | "freelancer";
    updating: boolean;
    error?: string;
  };
  onAgreeMilestonePlan?: (milestones: readonly ContractVersionMilestoneInput[]) => Promise<JobMilestonePlanAgreement>;
  onAgreeBasics?: (terms: JobBasicTerms) => Promise<{
    terms: JobBasicTerms | null;
    previousTerms?: JobBasicTerms | null;
    changedFields?: (keyof JobBasicTerms)[];
    changedBy?: "client" | "freelancer" | null;
    clientAgreed: boolean;
    freelancerAgreed: boolean;
  }>;
  onAgree?: (
    proposal?: ContractVersionAgreementInput,
    requestId?: string,
    contractDocument?: File,
  ) => Promise<boolean>;
  draftKey: string;
  draftUserId: string;
  contractDetailsFooter?: ReactNode;
}) {
  const clientLabel = clientName?.trim() ? `Client: ${clientName.trim()}` : "Client";
  const freelancerLabel = freelancerName?.trim() ? `Freelancer: ${freelancerName.trim()}` : "Freelancer";
  const isMilestoneProject = initial.projectType === "milestone";
  const milestoneStep = 2;
  const reviewStep = isMilestoneProject ? 3 : 2;
  const stepLabels = isMilestoneProject
    ? ["Contract Details", "Plan the Work", "Milestone Plan", "Review & Agreement"]
    : ["Contract Details", "Plan the Work", "Review & Agreement"];
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(basicAgreementStatus?.terms?.projectTitle ?? initial.title);
  const [description, setDescription] = useState(basicAgreementStatus?.terms?.description ?? initial.description);
  const [budget, setBudget] = useState(String(basicAgreementStatus?.terms?.budget ?? initial.budget ?? ""));
  const [revisions, setRevisions] = useState(String(basicAgreementStatus?.terms?.revisionsCount ?? initial.revisions ?? 0));
  const [startDate, setStartDate] = useState(() => basicAgreementStatus?.terms?.startDate || initial.startDate?.slice(0, 10) || todayDate());
  const [deadline, setDeadline] = useState(() => basicAgreementStatus?.terms?.deadline || initial.deadline?.slice(0, 10) || suggestedDeadline(initial.estimatedDays, initial.postingSubmittedAt));
  const [contractDocument, setContractDocument] = useState<File | null>(null);
  const [documentError, setDocumentError] = useState("");
  const [draggingDocument, setDraggingDocument] = useState(false);
  const contractDocumentInput = useRef<HTMLInputElement>(null);
  const versionRequestIdRef = useRef<string | null>(null);
  const versionRequestFingerprintRef = useRef<string | null>(null);
  const [plan, setPlan] = useState<WizardPlan | null>(() => {
    const normalized = normalizeWizardPlan(initial.plan);
    return normalized ? { ...normalized, name: initial.title, description: initial.description } : null;
  });
  const [milestones, setMilestones] = useState<ContractVersionMilestoneInput[]>(() => milestoneAgreementStatus?.milestones ?? []);
  const [milestonePlanDirty, setMilestonePlanDirty] = useState(false);
  const [milestoneRevisionMode, setMilestoneRevisionMode] = useState(false);
  const [milestoneReviewed, setMilestoneReviewed] = useState(false);
  const basicTerms: JobBasicTerms = {
    projectTitle: title.trim(),
    description: description.trim(),
    budget: Number(budget),
    revisionsCount: Number(revisions),
    startDate,
    deadline,
  };
  const basicTermsMatch = Boolean(
    basicAgreementStatus?.terms &&
    JSON.stringify(basicAgreementStatus.terms) === JSON.stringify(basicTerms),
  );
  const clientBasicAgreed = basicTermsMatch && basicAgreementStatus?.clientAgreed === true;
  const freelancerBasicAgreed = basicTermsMatch && basicAgreementStatus?.freelancerAgreed === true;
  const bothBasicTermsAgreed = clientBasicAgreed && freelancerBasicAgreed;
  const workPlanMatches = Boolean(
    plan && stableJson(plan) === stableJson(workPlanAgreementStatus?.plan),
  );
  const clientWorkPlanAgreed = workPlanMatches && workPlanAgreementStatus?.clientAgreed === true;
  const freelancerWorkPlanAgreed = workPlanMatches && workPlanAgreementStatus?.freelancerAgreed === true;
  const bothWorkPlanPartiesAgreed = clientWorkPlanAgreed && freelancerWorkPlanAgreed;
  const currentPartyWorkPlanAgreed = workPlanAgreementStatus?.currentParty === "freelancer"
    ? freelancerWorkPlanAgreed
    : clientWorkPlanAgreed;
  const bothBasicTermsAgreedRef = useRef(bothBasicTermsAgreed);
  bothBasicTermsAgreedRef.current = bothBasicTermsAgreed;
  const milestonePlanMatches = !milestoneRevisionMode && Boolean(milestoneAgreementStatus && JSON.stringify(milestoneAgreementStatus.milestones) === JSON.stringify(milestones));
  const clientMilestoneAgreed = milestonePlanMatches && milestoneAgreementStatus?.clientAgreed === true;
  const freelancerMilestoneAgreed = milestonePlanMatches && milestoneAgreementStatus?.freelancerAgreed === true;
  const bothMilestonePartiesAgreed = clientMilestoneAgreed && freelancerMilestoneAgreed;
  const milestoneTotal = milestones.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
  const milestoneBudgetMatches = Math.round(milestoneTotal * 100) === Math.round(Number(budget) * 100);
  const milestoneTasks = plan?.content.columns
    .filter((column) => column.type === "stage")
    .flatMap((column) => column.tasks.map((task) => ({
      id: `${column.id}:${task.id}`,
      stage: column.name,
      title: task.title,
      description: task.description,
    }))) ?? [];
  const milestoneFingerprint = JSON.stringify(milestoneAgreementStatus?.milestones ?? []);
  const serverMilestoneFingerprintRef = useRef(milestoneFingerprint);
  useEffect(() => {
    if (serverMilestoneFingerprintRef.current !== milestoneFingerprint) {
      serverMilestoneFingerprintRef.current = milestoneFingerprint;
      if (milestoneAgreementStatus?.changedBy && milestoneAgreementStatus.previousMilestones.length > 0) {
        setStep(bothBasicTermsAgreedRef.current ? milestoneStep : 0);
        setNotice("The milestone plan changed. Review the updated plan and both parties must agree again.");
      }
    }
    if (!milestonePlanDirty && milestoneAgreementStatus) setMilestones(milestoneAgreementStatus.milestones);
  }, [milestoneFingerprint, milestonePlanDirty, milestoneAgreementStatus]);
  const workPlanFingerprint = JSON.stringify(workPlanAgreementStatus?.plan ?? null);
  const serverWorkPlanFingerprintRef = useRef(workPlanFingerprint);
  useEffect(() => {
    if (serverWorkPlanFingerprintRef.current === workPlanFingerprint) return;
    serverWorkPlanFingerprintRef.current = workPlanFingerprint;
    setPlan(normalizeWizardPlan(workPlanAgreementStatus?.plan ?? null));
    setStep(1);
    setError("");
    setNotice("The work plan changed. Review the listed changes and both parties must confirm the updated plan.");
  }, [workPlanFingerprint, workPlanAgreementStatus?.plan]);
  const basicAgreementAtMountRef = useRef(basicAgreementStatus);
  const bothBasicTermsAgreedAtMountRef = useRef(bothBasicTermsAgreed);
  const currentPartyBasicAgreed = basicAgreementStatus?.currentParty === "client"
    ? clientBasicAgreed
    : freelancerBasicAgreed;
  const currentPartyContractAgreed = agreementStatus?.currentParty === "client"
    ? agreementStatus?.clientAgreed
    : agreementStatus?.currentParty === "freelancer" && agreementStatus?.freelancerAgreed;
  const serverBasicTermsFingerprint = JSON.stringify(basicAgreementStatus?.terms ?? null);
  const serverBasicTermsFingerprintRef = useRef(serverBasicTermsFingerprint);
  const [editingPlan, setEditingPlan] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(true);
  const [finalConfirmationOpen, setFinalConfirmationOpen] = useState(false);
  const [termsPolicyAccepted, setTermsPolicyAccepted] = useState(false);
  const [legalDialogOpen, setLegalDialogOpen] = useState(false);
  const [legalDocument, setLegalDocument] = useState<WorkSyncLegalDocument>("terms");
  const [agreementReviewed, setAgreementReviewed] = useState(false);
  const [willVerifySavedTerms, setWillVerifySavedTerms] = useState(false);
  const [planPreviewOpen, setPlanPreviewOpen] = useState(false);
  const [openingAgreement, setOpeningAgreement] = useState(false);
  const planSource = !plan
    ? "No plan selected"
    : initial.plan && stableJson(plan) === stableJson(normalizeWizardPlan(initial.plan))
      ? initial.planSource
      : "Selected project plan";
  const displayedPlanChanges = plan
    ? !workPlanMatches
      ? workPlanChanges(workPlanAgreementStatus?.plan ?? initial.plan, plan)
      : workPlanAgreementStatus?.previousPlan
        ? workPlanChanges(workPlanAgreementStatus.previousPlan, plan)
        : workPlanAgreementStatus?.hasPlanAgreement && workPlanAgreementStatus.changedBy
          ? workPlanChanges(null, plan)
          : []
    : [];
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [noticeError, setNoticeError] = useState(false);
  const deadlineViolationIds = new Set(
    (plan?.content.columns ?? []).flatMap((column) =>
      column.tasks
        .filter((task) => taskExceedsContractTimeline(task, startDate, deadline))
        .map((task) => task.id),
    ),
  );

  useEffect(() => {
    if (agreementStatus?.isNew === false) {
      setDraftReady(true);
      return;
    }
    let current = true;
    setDraftReady(false);
    void loadContractCreationDraft(draftKey, draftUserId)
      .then((stored) => {
        if (!current || stored === null) return;
        const draft = readStoredDraft(stored);
        if (!draft) return;
        const restoredStep = draft.schemaVersion === 1 && isMilestoneProject && draft.step === 2
          ? reviewStep
          : draft.step;
        setStep(basicAgreementAtMountRef.current && !bothBasicTermsAgreedAtMountRef.current ? 0 : Math.min(restoredStep, reviewStep));
        if (!basicAgreementAtMountRef.current?.terms) {
          setTitle(draft.title);
          setDescription(draft.description);
          setBudget(draft.budget);
          setRevisions(draft.revisions);
          setStartDate(draft.startDate);
          setDeadline(draft.deadline);
        }
        setPlan(draft.plan);
        versionRequestIdRef.current = draft.versionRequestId;
        versionRequestFingerprintRef.current = draft.versionRequestFingerprint;
        setNoticeError(false);
        setNotice(`Draft restored from Supabase. Last saved ${new Date(draft.savedAt).toLocaleString()}.${draft.contractDocumentName ? ` Reattach Ã¢â‚¬Å“${draft.contractDocumentName}Ã¢â‚¬Â if you still want to send it.` : ""}`);
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
  }, [draftKey, draftUserId, agreementStatus?.isNew, isMilestoneProject, reviewStep]);

  useEffect(() => {
    if (serverBasicTermsFingerprintRef.current === serverBasicTermsFingerprint) return;
    serverBasicTermsFingerprintRef.current = serverBasicTermsFingerprint;
    const terms = basicAgreementStatus?.terms;
    if (!terms) return;
    if (basicAgreementStatus?.changedFields?.length) {
      setStep(0);
      setNotice("The basic terms changed. Both parties must review and agree again.");
    }
    setTitle(terms.projectTitle);
    setDescription(terms.description);
    setBudget(String(terms.budget));
    setRevisions(String(terms.revisionsCount));
    setStartDate(terms.startDate);
    setDeadline(terms.deadline);
    setPlan((current) => current ? { ...current, name: terms.projectTitle, description: terms.description } : current);
  }, [basicAgreementStatus?.terms, basicAgreementStatus?.changedFields, serverBasicTermsFingerprint]);

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
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      step: step as 0 | 1 | 2 | 3,
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
      setNotice("");
      return true;
    } catch {
      setNoticeError(true);
      setNotice("Draft could not be saved to WorkSync. Check your connection and try again.");
      return false;
    } finally {
      setDraftSaving(false);
    }
  }

  async function openAgreementFlow(agree = false): Promise<boolean> {
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
    if (!bothWorkPlanPartiesAgreed) {
      setError("Both the client and freelancer must agree to the same work plan before the contract can continue.");
      return false;
    }
    if (initial.projectType === "milestone" && !bothMilestonePartiesAgreed) {
      setError("Both the client and freelancer must agree to the milestone plan before the contract can be sent.");
      return false;
    }
    if (deadlineViolationIds.size) {
      setError("Update the highlighted task estimates or due dates so they fit within the contract deadline.");
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
      plan: plan && initial.projectType === "milestone" ? {
        ...plan,
        content: {
          ...plan.content,
          columns: plan.content.columns.map((column) => ({
            ...column,
            tasks: column.tasks.map((task) => ({
              ...task,
              milestoneId: milestones.find((milestone) =>
                milestone.taskIds?.includes(`${column.id}:${task.id}`),
              )?.id,
            })),
          })),
        },
      } : plan,
      ...(initial.projectType === "milestone" ? { milestones } : {}),
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
      if (agree) {
        if (!onAgree || !(await onAgree(proposal, requestId, contractDocument ?? undefined)))
          throw new Error("Your agreement could not be recorded. Please try again.");
      } else {
        await onOpenExistingAgreement(proposal, requestId, contractDocument ?? undefined);
      }
      return true;
    } catch (cause) {
      if (!openSubscriptionLimitDialog(cause))
        setError(cause instanceof Error ? cause.message : "Unable to send the contract document.");
      return false;
    } finally {
      setOpeningAgreement(false);
    }
  }

  async function agreeToContract(): Promise<boolean> {
    if (!onAgree || currentPartyContractAgreed) return false;
    if (!bothWorkPlanPartiesAgreed) {
      setError("Both the client and freelancer must agree to the same work plan before the contract can continue.");
      return false;
    }
    if (agreementStatus?.isNew === false) {
      setError("");
      setOpeningAgreement(true);
      try {
        if (!(await onAgree())) {
          throw new Error("Your agreement could not be recorded. Please try again.");
        }
        return true;
      } catch (cause) {
        if (!openSubscriptionLimitDialog(cause))
          setError(cause instanceof Error ? cause.message : "Your agreement could not be recorded. Please try again.");
        return false;
      } finally {
        setOpeningAgreement(false);
      }
    }
    return openAgreementFlow(true);
  }

  async function agreeToBasicTerms(): Promise<void> {
    if (!onAgreeBasics || !basicAgreementStatus) return;
    const validation = validateDetails();
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    setNotice("");
    const changedExistingTerms = Boolean(
      basicAgreementStatus.terms &&
      JSON.stringify(basicAgreementStatus.terms) !== JSON.stringify(basicTerms),
    );
    setOpeningAgreement(true);
    try {
      const result = await onAgreeBasics(basicTerms);
      if (result.terms) {
        setTitle(result.terms.projectTitle);
        setDescription(result.terms.description);
        setBudget(String(result.terms.budget));
        setRevisions(String(result.terms.revisionsCount));
        setStartDate(result.terms.startDate);
        setDeadline(result.terms.deadline);
      }
      if (changedExistingTerms)
        setNotice("Terms updated. Both parties must review and agree again.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record agreement to the basic terms.");
    } finally {
      setOpeningAgreement(false);
    }
  }

  async function agreeToWorkPlan(): Promise<void> {
    if (!onAgreeWorkPlan || !plan || !workPlanAgreementStatus) return;
    setError("");
    setNotice("");
    try {
      await onAgreeWorkPlan(plan);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the work plan agreement.");
    }
  }

  async function agreeToMilestonePlan(): Promise<void> {
    if (!onAgreeMilestonePlan || !milestoneAgreementStatus) return;
    if (!milestoneReviewed) { setError("Confirm that you agree to the milestone plan before submitting."); return; }
    if (milestones.length < 1) { setError("Add at least one milestone."); return; }
    if (milestones.some((item) => !findTaskForMilestone(item, milestoneTasks) || item.amount <= 0 || !validDate(item.dueDate ?? ""))) {
      setError("Choose a plan task, positive budget amount, and valid deadline for every milestone."); return;
    }
    if (Math.round(milestoneTotal * 100) !== Math.round(Number(budget) * 100)) {
      setError("Milestone amounts must add up to the agreed project budget."); return;
    }
    if (milestones.some((item) => !item.dueDate || item.dueDate < startDate || item.dueDate > deadline) || milestones.some((item, index) => index > 0 && (item.dueDate ?? "") < (milestones[index - 1].dueDate ?? ""))) {
      setError("Set milestone deadlines in order, within the agreed project dates."); return;
    }
    setError("");
    setNotice("");
    const savedMilestones = milestones.map((item, index) => ({ ...item, displayOrder: index + 1, taskIds: item.taskIds ?? [] }));
    const existingMilestones = (milestoneAgreementStatus.milestones ?? []).map((item, index) => ({ ...item, displayOrder: index + 1, taskIds: item.taskIds ?? [] }));
    const changedExistingPlan = existingMilestones.length > 0 && JSON.stringify(existingMilestones) !== JSON.stringify(savedMilestones);
    setOpeningAgreement(true);
    try {
      const saved = await onAgreeMilestonePlan(milestones.map((item, index) => ({ ...item, displayOrder: index + 1 })));
      setMilestones(saved.milestones);
      setMilestonePlanDirty(false);
      setMilestoneRevisionMode(false);
      setMilestoneReviewed(false);
      if (changedExistingPlan)
        setNotice("Milestone plan updated. Both parties must review and agree again.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save agreement to the milestone plan.");
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
    const movingTask = plan?.content.columns
      .find((column) => column.id === sourceColumnId)
      ?.tasks.find((task) => task.id === taskId);
    const sourceStageIndex = plan?.content.columns.findIndex(
      (column) => column.id === sourceColumnId,
    ) ?? -1;
    const targetStageIndex = plan?.content.columns.findIndex(
      (column) => column.id === targetColumnId,
    ) ?? -1;
    if (
      targetStageIndex > sourceStageIndex &&
      movingTask &&
      taskExceedsContractTimeline(movingTask, startDate, deadline)
    ) {
      setError("Resolve this task's estimate or due date before moving it to another stage.");
      return;
    }
    setError("");
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

    {step === reviewStep && deadlineViolationIds.size > 0 && <p role="alert" className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{deadlineViolationIds.size} {deadlineViolationIds.size === 1 ? "task exceeds" : "tasks exceed"} the contract delivery deadline. Go back to the planner and update the highlighted tasks before continuing.</p>}

    <ol aria-label="Contract creation progress" className="grid gap-2 sm:gap-5" style={{ gridTemplateColumns: `repeat(${stepLabels.length}, minmax(0, 1fr))` }}>{stepLabels.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={`border-t-2 pt-3 ${index <= step ? "border-primary" : "border-border"}`}><div className="flex items-center gap-2"><span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm ${index < step ? "bg-primary text-primary-foreground" : index === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{index < step ? <Check className="size-4"/> : index + 1}</span><span className={`text-xs font-medium sm:text-sm ${index === step ? "text-foreground" : "text-muted-foreground"}`}>{label}</span></div><p className="mt-1 pl-9 text-xs text-muted-foreground">{index === 0 ? "Budget, revisions, deadline" : index === 1 ? "Stages and tasks" : isMilestoneProject && index === milestoneStep ? "Tasks and budget split" : "Preview contract"}</p></li>)}</ol>
    {notice && <p role={noticeError ? "alert" : "status"} className={`text-sm ${noticeError ? "text-destructive" : "text-emerald-700 dark:text-emerald-300"}`}>{notice}</p>}

    {step === 0 && <><div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.95fr)]">
      <div className="space-y-4">
      <Card className="border-border/80 bg-card/70"><CardHeader><CardTitle>Contract Details</CardTitle><p className="text-sm text-muted-foreground">Define the basic terms of your agreement.</p></CardHeader><CardContent className="space-y-5">
        <Field id="wizard-title" label="Project title" required error={error && !title.trim() ? "Project title is required." : ""}><Input id="wizard-title" value={title} onChange={(event) => { const next = event.target.value; setTitle(next); setPlan((current) => current ? { ...current, name: next } : current); }} placeholder="Project title" aria-invalid={!!error && !title.trim()}/></Field>
        <Field id="wizard-description" label="Description" required error={error && !description.trim() ? "Description is required." : ""}><Textarea id="wizard-description" value={description} onChange={(event) => { const next = event.target.value; setDescription(next); setPlan((current) => current ? { ...current, description: next } : current); }} placeholder="Describe the agreed scope and intended outcomeÃ¢â‚¬Â¦" className="min-h-24" aria-invalid={!!error && !description.trim()}/></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field id="wizard-budget" label="Budget (PHP)" required error={error && (!Number.isFinite(Number(budget)) || Number(budget) <= 0) ? "Enter a positive budget." : ""}><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">PHP</span><Input id="wizard-budget" type="number" min="1" step="0.01" className="pl-12" value={budget} onChange={(event) => setBudget(event.target.value)}/></div></Field><Field id="wizard-revisions" label="Included revisions" required error={error && (!revisions.trim() || !Number.isInteger(Number(revisions)) || Number(revisions) < 0) ? "Enter zero or more revisions." : ""}><Input id="wizard-revisions" type="number" min="0" step="1" value={revisions} onChange={(event) => setRevisions(event.target.value)}/></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field id="wizard-start-date" label="Project start date" required error={error && (!validDate(startDate) || startDate < todayDate()) ? "Choose today or a future project start date." : ""}><div className="relative"><CalendarDays className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input id="wizard-start-date" type="date" min={todayDate()} className="pl-10" value={startDate} onChange={(event) => { if (event.target.value >= todayDate()) setStartDate(event.target.value); }}/></div></Field><Field id="wizard-deadline" label="Delivery deadline" required error={error && (!validDate(deadline) || deadline < startDate) ? "Choose a delivery deadline on or after the project start date." : ""}><div className="relative"><CalendarDays className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input id="wizard-deadline" type="date" min={startDate} className="pl-10" value={deadline} onChange={(event) => { if (event.target.value >= startDate) setDeadline(event.target.value); }}/></div>{!(initial.estimatedDays && !initial.deadline) && <p className="text-xs text-muted-foreground">Choose a deadline on or after the project start date.</p>}</Field></div>
        <Field id="contract-document" label="Attach your contract document (optional)"><input ref={contractDocumentInput} id="contract-document" type="file" className="sr-only" aria-label="Choose a PDF or Word contract document" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setContractDocumentFile(event.target.files?.[0] ?? null)}/><div onDragEnter={(event) => { event.preventDefault(); setDraggingDocument(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingDocument(false); }} onDrop={(event) => { event.preventDefault(); setDraggingDocument(false); setContractDocumentFile(event.dataTransfer.files.item(0)); }} className={`flex min-h-[76px] items-center gap-3 rounded-lg border px-4 py-3 transition ${draggingDocument ? "border-primary bg-primary/10" : "border-border/80 bg-muted/30"}`}><button type="button" aria-label="Drag and drop a PDF, DOC, or DOCX file here, or click to browse" onClick={() => contractDocumentInput.current?.click()} className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><FileUp className="size-6 shrink-0 text-primary"/><span className="max-w-[85%]">{contractDocument ? <><span className="block truncate text-xs font-medium text-foreground">{contractDocument.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{(contractDocument.size / (1024 * 1024)).toFixed(2)} MB Ã‚Â· click to replace</span></> : <><span className="block text-xs font-medium text-foreground">Drag &amp; drop your file or click to browse</span><span className="mt-1 block text-[10px] text-muted-foreground">Supported: PDF, DOC, DOCX</span></>}</span></button>{contractDocument && <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Remove contract document" onClick={() => { setContractDocumentFile(null); if (contractDocumentInput.current) contractDocumentInput.current.value = ""; }}><X className="size-4"/></Button>}</div>{documentError && <p role="alert" className="text-xs text-destructive">{documentError}</p>}<p className="text-xs text-muted-foreground">Attach a custom contract document for the other party to review in your agreement conversation.</p></Field>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={!draftReady || draftSaving} onClick={() => void saveDraftNotice()}>{draftSaving ? "SavingÃ¢â‚¬Â¦" : "Save draft"}</Button><Button type="button" disabled={Boolean(basicAgreementStatus && !bothBasicTermsAgreed)} onClick={() => { const validation = validateDetails(); setError(validation || (basicAgreementStatus && !bothBasicTermsAgreed ? "Both the client and freelancer must agree to these basic terms before continuing to the planner." : "")); setNotice(""); if (!validation && (!basicAgreementStatus || bothBasicTermsAgreed)) setStep(1); }}>Continue to planner <ArrowRight/></Button></div>
      </CardContent></Card>
      {contractDetailsFooter}
      </div>
      <Card className="border-border/80 bg-card/70"><CardHeader><CardTitle>Contract Summary</CardTitle></CardHeader><CardContent className="space-y-5"><SummaryRow icon={<FileText/>} label="Project" value={title || "Not set"}/><SummaryRow icon={<Wallet/>} label="Budget" value={budget && Number(budget) > 0 ? `PHP ${Number(budget).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "Not set"}/><SummaryRow icon={<RotateCcw/>} label="Included revisions" value={revisions || "Not set"}/><SummaryRow icon={<CalendarDays/>} label="Delivery deadline" value={deadline ? new Date(`${deadline}T00:00:00`).toLocaleDateString() : "Not set"}/>{basicAgreementStatus && onAgreeBasics && <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">Basic terms agreement</h3>{basicAgreementStatus.error && <p role="alert" className="text-xs text-destructive">Agreement status could not be loaded: {basicAgreementStatus.error}</p>}<div className="flex items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">{clientLabel}</span><Badge variant={clientBasicAgreed ? "secondary" : "outline"}>{clientBasicAgreed ? "Agreed" : "Pending"}</Badge></div><div className="flex items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">{freelancerLabel}</span><Badge variant={freelancerBasicAgreed ? "secondary" : "outline"}>{freelancerBasicAgreed ? "Agreed" : "Pending"}</Badge></div>{!bothBasicTermsAgreed && basicAgreementStatus.previousTerms && basicAgreementStatus.terms && Boolean(basicAgreementStatus.changedFields?.length) && <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"><p className="text-sm font-medium">{basicAgreementStatus.changedBy === "client" ? clientLabel : freelancerLabel} changed these terms. Both parties must agree again.</p>{basicAgreementStatus.changedFields?.map((field) => <div key={field} className="rounded-md bg-background/60 px-2.5 py-2 text-sm"><p className="font-medium">{basicTermLabels[field]}</p><p className="mt-1 text-muted-foreground"><span className="line-through">{formatBasicTerm(field, basicAgreementStatus.previousTerms![field])}</span><span className="mx-2 text-amber-600">â†’</span><span className="font-semibold text-foreground">{formatBasicTerm(field, basicAgreementStatus.terms![field])}</span></p></div>)}</div>}{basicAgreementStatus.terms && !basicTermsMatch && <p className="text-xs text-muted-foreground">These terms changed. Both parties must agree to the updated terms.</p>}{!bothBasicTermsAgreed && <p className="text-xs text-muted-foreground">Both parties must agree to these basic terms before the planner can continue.</p>}<Button type="button" className="w-full" disabled={busy || openingAgreement || basicAgreementStatus.updating || !draftReady || currentPartyBasicAgreed} onClick={() => void agreeToBasicTerms()}>{openingAgreement ? "Saving agreement..." : currentPartyBasicAgreed ? "Agreed to basic terms" : "Agree to basic terms"}</Button></div>}<div className="border-t pt-5"><h3 className="font-semibold">Conversation</h3>{conversationError && <p role="alert" className="mt-2 text-sm text-destructive">{conversationError}</p>}{conversation ? <ProjectChatPanel {...conversation} className="mt-3 h-[min(55vh,520px)] min-h-[320px]"/> : !conversationError ? <p className="mt-2 text-sm text-muted-foreground">Loading the shared conversation...</p> : null}</div></CardContent></Card>
    </div></>}

    {step === 1 && <div className={conversation && conversationOpen ? "grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.75fr)] xl:items-stretch" : ""}>
      <Card className="flex flex-col border-border/80 bg-card/70">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3 sm:flex-row">
          <div>
            <CardTitle>Plan the Work</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Attach a saved plan or review the freelancer&apos;s submitted plan. Both participants must confirm the same version.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="outline">{planSource}</Badge>
            <div className="flex flex-nowrap gap-2">
              {plan && <Button type="button" variant="outline" onClick={() => setEditingPlan(true)}><Pencil/>Edit plan board</Button>}
              {conversation && <Button type="button" variant="outline" aria-expanded={conversationOpen} onClick={() => setConversationOpen((open) => !open)}><MessageSquare/>{conversationOpen ? "Hide conversation" : "Show conversation"}</Button>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {deadlineViolationIds.size > 0 && <p role="alert" className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{deadlineViolationIds.size} {deadlineViolationIds.size === 1 ? "task exceeds" : "tasks exceed"} the contract delivery deadline. Shorten the estimate or move the due date to on or before {deadline} to continue.</p>}
          <ProjectPlanProposalAttachment
            value={plan}
            showAttachedEditor={false}
            onChange={(next) => { setPlan(normalizeWizardPlan(next)); setError(""); }}
          />
          {plan ? (
            <div className="flex h-[min(66dvh,720px)] min-h-[420px] shrink-0 flex-col gap-3">
              <div className="shrink-0 space-y-2">
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description || "No plan description."}</p>
              </div>
              <div className="min-h-0 flex-1 overflow-auto"><PlanColumns value={plan} fit invalidTaskIds={deadlineViolationIds}/></div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <FileText className="mx-auto size-8 text-muted-foreground"/>
              <h3 className="mt-3 font-medium">No attached work plan</h3>
              <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">Choose a saved plan above or ask the freelancer to attach one before continuing.</p>
            </div>
          )}
          {displayedPlanChanges.length > 0 && (
            <section aria-label="Changes to the work plan" className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Changes to the work plan</h3>
                {workPlanMatches && workPlanAgreementStatus?.changedBy && <Badge variant="outline">Changed by {workPlanAgreementStatus.changedBy === "client" ? clientLabel : freelancerLabel}</Badge>}
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {displayedPlanChanges.map((change, index) => <li key={`${index}-${change}`}>{change}</li>)}
              </ul>
            </section>
          )}
          <section aria-label="Work plan confirmation status" className="space-y-3 rounded-xl border p-4">
            <div>
              <h3 className="font-semibold">Work plan confirmation</h3>
              <p className="mt-1 text-sm text-muted-foreground">Both participants must agree to the same saved work plan before continuing.</p>
            </div>
            {workPlanAgreementStatus?.error && <p role="alert" className="text-sm text-destructive">Work plan confirmation is unavailable: {workPlanAgreementStatus.error}</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-sm"><span>{clientLabel}</span><Badge variant={clientWorkPlanAgreed ? "secondary" : "outline"}>{clientWorkPlanAgreed ? "Agreed" : "Pending"}</Badge></div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-sm"><span>{freelancerLabel}</span><Badge variant={freelancerWorkPlanAgreed ? "secondary" : "outline"}>{freelancerWorkPlanAgreed ? "Agreed" : "Pending"}</Badge></div>
            </div>
            {plan && !workPlanMatches && <p className="text-xs text-amber-700 dark:text-amber-300">Save these changes first. Both participants will need to confirm the updated version.</p>}
            {workPlanMatches && workPlanAgreementStatus?.changedBy && !bothWorkPlanPartiesAgreed && <p className="text-xs text-amber-700 dark:text-amber-300">The plan was changed by {workPlanAgreementStatus.changedBy === "client" ? clientLabel : freelancerLabel}. Both participants must confirm this version again.</p>}
            <Button type="button" className="w-full sm:w-auto" disabled={!plan || !workPlanAgreementStatus || Boolean(workPlanAgreementStatus.error) || workPlanAgreementStatus.updating || !draftReady || currentPartyWorkPlanAgreed} onClick={() => void agreeToWorkPlan()}>
              {workPlanAgreementStatus?.updating ? "Saving confirmation…" : !workPlanMatches ? "Save plan changes" : currentPartyWorkPlanAgreed ? "Agreed to work plan" : "Agree to work plan"}
            </Button>
          </section>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex shrink-0 flex-col-reverse justify-between gap-2 border-t pt-3 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => { setError(""); setStep(0); }}>Back to contract details</Button>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={!draftReady || draftSaving} onClick={() => void saveDraftNotice()}>{draftSaving ? "Saving…" : "Save draft"}</Button>
              <Button type="button" disabled={!bothWorkPlanPartiesAgreed || !plan || deadlineViolationIds.size > 0} onClick={() => { setError(""); setEditingPlan(false); setStep(isMilestoneProject ? milestoneStep : reviewStep); }}>{isMilestoneProject ? "Continue to milestone plan" : "Continue to review"} <ArrowRight/></Button>
            </div>
          </div>
        </CardContent>
      </Card>
      {plan && <Dialog open={editingPlan} onOpenChange={setEditingPlan}><DialogContent className="flex h-[96dvh] max-h-[96dvh] w-[98vw] max-w-[98vw] flex-col gap-3 overflow-hidden p-4 sm:max-w-[98vw]"><DialogHeader className="shrink-0"><DialogTitle>Edit project plan</DialogTitle><DialogDescription>Update the plan name, description, stages, tasks, estimates, and milestones for this contract proposal.</DialogDescription></DialogHeader><div className="flex min-h-0 flex-1"><PlanEditor value={plan} startDate={startDate} deadline={deadline} invalidTaskIds={deadlineViolationIds} onUpdateColumn={updatePlanColumn} onUpdateTask={updateTask} onMoveTask={movePlanTask} onUpdateDetails={(patch) => setPlan((current) => current ? { ...current, ...patch } : current)} /></div><DialogFooter className="shrink-0"><Button type="button" onClick={() => setEditingPlan(false)}>Done editing</Button></DialogFooter></DialogContent></Dialog>}
      {conversation && <ProjectChatPanel {...conversation} className={`${conversationOpen ? "h-[min(92dvh,1000px)] min-h-[480px]" : "hidden"}`} />}
    </div>}

    {step === milestoneStep && isMilestoneProject && <div className={conversation && conversationOpen ? "grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.75fr)] xl:items-stretch" : ""}>
      <MilestonePlanAgreementSection projectType={initial.projectType} status={milestoneAgreementStatus} budget={Number(budget)} deadline={deadline} milestones={milestones} tasks={milestoneTasks} clientAgreed={clientMilestoneAgreed} freelancerAgreed={freelancerMilestoneAgreed} currentParty={milestoneAgreementStatus?.currentParty ?? basicAgreementStatus?.currentParty ?? "client"} clientLabel={clientLabel} freelancerLabel={freelancerLabel} updating={openingAgreement || Boolean(milestoneAgreementStatus?.updating)} reviewed={milestoneReviewed} onReviewedChange={setMilestoneReviewed} onRequestRevision={() => { setMilestoneRevisionMode(true); setMilestonePlanDirty(true); setMilestoneReviewed(false); }} onChange={(next) => { setMilestones(next); setMilestonePlanDirty(true); setMilestoneReviewed(false); }} onAgree={() => void agreeToMilestonePlan()} headerAction={conversation ? <Button type="button" variant="outline" aria-expanded={conversationOpen} onClick={() => setConversationOpen((open) => !open)}><MessageSquare/>{conversationOpen ? "Hide conversation" : "Show conversation"}</Button> : null} navigation={<div className="flex flex-col-reverse justify-between gap-2 border-t pt-4 sm:flex-row"><Button type="button" variant="outline" onClick={() => { setError(""); setStep(1); }}>Back to Plan the Work</Button><Button type="button" disabled={!bothMilestonePartiesAgreed || deadlineViolationIds.size > 0 || milestones.length === 0 || !milestoneBudgetMatches} onClick={() => { setError(""); setStep(reviewStep); }}>Continue to review <ArrowRight/></Button></div>} />
      {conversation && <ProjectChatPanel {...conversation} className={`${conversationOpen ? "h-[min(92dvh,1000px)] min-h-[480px]" : "hidden"}`} />}
    </div>}

    {step === reviewStep && <Card className="border-border/80 bg-card/70"><CardHeader><CardTitle>Review & Agreement</CardTitle><p className="text-sm text-muted-foreground">Review the prepared details and plan before final confirmation.</p></CardHeader><CardContent className="space-y-5"><section className="rounded-xl border p-4"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{description}</p><div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-4"><InlineSummaryRow label="Budget" value={`PHP ${Number(budget).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}/><InlineSummaryRow label="Included revisions" value={revisions}/><InlineSummaryRow label="Project start" value={new Date(`${startDate}T00:00:00`).toLocaleDateString()}/><InlineSummaryRow label="Delivery deadline" value={new Date(`${deadline}T00:00:00`).toLocaleDateString()}/></div>{contractDocument && <div className="mt-4 flex items-center gap-2 border-t pt-4 text-sm"><Paperclip className="size-4 text-muted-foreground"/><span>{contractDocument.name}</span><span className="text-xs text-muted-foreground">Will be sent in the agreement conversation for review; it is not automatically part of the signed terms.</span></div>}</section>{initial.projectType === "milestone" && <section className="rounded-xl border p-4"><h2 className="font-semibold">Agreed milestone schedule</h2><div className="mt-3 space-y-2">{milestones.map((milestone, index) => <div key={milestone.id} className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm"><span>{index + 1}. {milestone.title}</span><span className="text-muted-foreground">PHP {milestone.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })} Â· Due {milestone.dueDate}</span></div>)}</div><p className="mt-3 border-t pt-3 text-sm font-medium">Total: PHP {milestoneTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p></section>}{plan && <Card className="border-border/80 bg-card/50"><CardHeader className="pb-3"><CardTitle className="text-base">{plan.name}</CardTitle>{plan.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{plan.description}</p>}</CardHeader><CardContent className="pt-0"><PlanColumns value={plan} fit invalidTaskIds={deadlineViolationIds}/></CardContent></Card>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{(agreementStatus || basicAgreementStatus || initial.projectType === "milestone") && <section aria-label="Party agreement status" className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Final contract confirmation</h2><div className="grid gap-2 sm:grid-cols-2"><div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-sm"><span>{clientLabel}</span><Badge variant={agreementStatus?.clientAgreed ? "secondary" : "outline"}>{agreementStatus?.clientAgreed ? "Agreed" : "Pending"}</Badge></div><div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-sm"><span>{freelancerLabel}</span><Badge variant={agreementStatus?.freelancerAgreed ? "secondary" : "outline"}>{agreementStatus?.freelancerAgreed ? "Agreed" : "Pending"}</Badge></div></div><p className="text-xs text-muted-foreground">The project becomes Active after both parties confirm the final contract.</p></section>}<div className="flex flex-col-reverse justify-between gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={() => setStep(isMilestoneProject ? milestoneStep : 1)}>{isMilestoneProject ? "Back to Milestone Plan" : "Back to Plan the Work"}</Button><Button type="button" disabled={busy || openingAgreement || deadlineViolationIds.size > 0} onClick={() => { setTermsPolicyAccepted(false); setAgreementReviewed(false); setWillVerifySavedTerms(false); setFinalConfirmationOpen(true); }}>Final confirmation</Button></div></CardContent></Card>}

    {step === reviewStep && <Dialog open={finalConfirmationOpen} onOpenChange={(open) => { setFinalConfirmationOpen(open); if (!open) { setTermsPolicyAccepted(false); setAgreementReviewed(false); setWillVerifySavedTerms(false); } }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{onAgree ? agreementStatus?.isNew ? "Review and agree to contract" : "Confirm contract agreement" : "Final proposal confirmation"}</DialogTitle><DialogDescription>{onAgree ? agreementStatus?.isNew ? "Review the proposed terms. Agreeing will create the contract and record your confirmation." : "Review the saved contract terms and confirm your agreement." : "Review the project terms and plan before continuing to the existing contract view."}</DialogDescription></DialogHeader><section className="rounded-lg border p-4"><ul className="space-y-2 text-sm"><li><span className="font-semibold">Project name:</span> {title}</li><li><span className="font-semibold">Description:</span> <span className="line-clamp-2 text-muted-foreground">{description}</span></li><li><span className="font-semibold">Budget:</span> PHP {Number(budget).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</li><li><span className="font-semibold">Included revisions:</span> {revisions}</li><li><span className="font-semibold">Project start:</span> {new Date(`${startDate}T00:00:00`).toLocaleDateString()}</li><li><span className="font-semibold">Delivery deadline:</span> {new Date(`${deadline}T00:00:00`).toLocaleDateString()}</li>{contractDocument && <li><span className="font-semibold">Custom contract (optional):</span> {contractDocument.name}</li>}</ul></section>{initial.projectType === "milestone" && <section className="rounded-lg border p-4"><h3 className="font-semibold">Agreed milestone schedule</h3><ul className="mt-2 space-y-2 text-sm">{milestones.map((milestone, index) => <li key={milestone.id} className="flex flex-wrap justify-between gap-2 border-t pt-2"><span>{index + 1}. {milestone.title}</span><span>PHP {milestone.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })} Â· {milestone.dueDate}</span></li>)}</ul><p className="mt-2 text-right text-sm font-semibold">Total: PHP {milestoneTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p></section>}{plan && <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3"><div className="min-w-0"><h3 className="truncate text-sm font-medium">{plan.name}</h3><p className="text-xs text-muted-foreground">{plan.content.columns.length} stages Ã‚Â· {plan.content.columns.reduce((count, column) => count + column.tasks.length, 0)} tasks</p></div><Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setPlanPreviewOpen(true)}><Eye/>View full plan</Button></section>}<section className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold">Terms and agreement</h3><div className="flex items-start gap-3 text-sm"><Checkbox id="worksync-terms-policy" checked={termsPolicyAccepted} onCheckedChange={(checked) => setTermsPolicyAccepted(checked === true)} aria-label="I agree to WorkSync contract terms and have read the contract privacy notice" className="mt-0.5 size-5"/><div className="leading-6"><label htmlFor="worksync-terms-policy">I agree to WorkSync&#39;s</label> <button type="button" className="cursor-pointer underline underline-offset-2 hover:text-foreground" onClick={() => { setLegalDocument("terms"); setLegalDialogOpen(true); }}>Contract Terms</button> and <button type="button" className="cursor-pointer underline underline-offset-2 hover:text-foreground" onClick={() => { setLegalDocument("privacy"); setLegalDialogOpen(true); }}>Contract Privacy Notice</button>.</div></div><label className="flex cursor-pointer items-start gap-3 text-sm"><Checkbox checked={agreementReviewed} onCheckedChange={(checked) => setAgreementReviewed(checked === true)} aria-label="Confirm that I reviewed the agreement terms above" className="mt-0.5 size-5"/><span>I confirm that I have reviewed the agreement terms above.</span></label><label className="flex cursor-pointer items-start gap-3 text-sm"><Checkbox checked={willVerifySavedTerms} onCheckedChange={(checked) => setWillVerifySavedTerms(checked === true)} aria-label="Confirm that I will verify the saved contract terms before signing" className="mt-0.5 size-5"/><span>I will verify the saved contract terms before signing.</span></label></section>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button type="button" disabled={currentPartyContractAgreed ? busy || openingAgreement || agreementStatus?.updating : !(termsPolicyAccepted && agreementReviewed && willVerifySavedTerms) || busy || openingAgreement || agreementStatus?.updating} onClick={() => { if (currentPartyContractAgreed) { setFinalConfirmationOpen(false); setTermsPolicyAccepted(false); setAgreementReviewed(false); setWillVerifySavedTerms(false); return; } void (onAgree ? agreeToContract() : openAgreementFlow()).then((opened) => { if (opened) setFinalConfirmationOpen(false); }); }}>{busy || openingAgreement || agreementStatus?.updating ? "Saving agreementâ€¦" : currentPartyContractAgreed ? "Close" : onAgree ? agreementStatus?.isNew ? "Agree and create contract" : "Agree to contract" : "Continue to contract view"}</Button></DialogFooter></DialogContent></Dialog>}<WorkSyncLegalDialog open={legalDialogOpen} onOpenChange={setLegalDialogOpen} document={legalDocument} onDocumentChange={setLegalDocument} context="contract"/>{plan && <ProjectPlanSnapshotPreview plan={plan} open={planPreviewOpen} onOpenChange={setPlanPreviewOpen}/> }

  </main>;
}

function Field({ id, label, required, error, compact = false, children }: { id: string; label: string; required?: boolean; error?: string; compact?: boolean; children: React.ReactNode }) {
  return <div className={compact ? "space-y-1" : "space-y-1.5"}><label htmlFor={id} className={`${compact ? "text-xs" : "text-sm"} font-medium`}>{label}{required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}</label>{children}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}

function SummaryRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2.5 text-sm text-muted-foreground">{icon && <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">{icon}</span>}{label}</span><span className="text-right text-sm font-medium">{value}</span></div>;
}

function InlineSummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}

function PlanColumns({ value, fit = false, invalidTaskIds = new Set<string>() }: { value: ProjectPlanSnapshotData; fit?: boolean; invalidTaskIds?: Set<string> }) {
  const accents = ["border-emerald-500/70", "border-sky-500/70", "border-violet-500/60"];
  return <div className={fit ? "grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" : "overflow-x-auto"}><div className={fit ? "contents" : "flex min-w-full gap-3 pb-2"}>{value.content.columns.map((column, index) => <section key={column.id} aria-label={`${column.name}, ${column.tasks.length} tasks`} className={`${fit ? "min-w-0 w-full" : "w-72 shrink-0 grow"} rounded-xl border border-border/80 border-t-2 bg-card p-4 text-card-foreground ${accents[index % accents.length]}`}><div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-foreground">{column.name}</h3><Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">{column.tasks.length}</Badge></div>{column.tasks.length ? <div className="mt-3 space-y-2">{column.tasks.map((task) => { const invalid = invalidTaskIds.has(task.id); return <article key={task.id} className={`rounded-lg border ${invalid ? "border-destructive ring-1 ring-destructive" : "border-border/80"} bg-muted/30 p-3`}><h4 className="text-sm font-medium text-foreground">{task.title}</h4>{task.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{task.description}</p>}<Badge variant="outline" className="mt-2 border-border bg-background/70 text-muted-foreground">{task.priority} priority</Badge></article>; })}</div> : <p className="mt-4 text-sm text-muted-foreground">No tasks in this stage.</p>}</section>)}</div></div>;
}

function PlanEditor({ value, startDate, deadline, invalidTaskIds, onUpdateColumn, onUpdateTask, onMoveTask, onUpdateDetails }: {
  value: WizardPlan;
  startDate: string;
  deadline: string;
  invalidTaskIds: Set<string>;
  onUpdateColumn: (columnId: string, update: (column: WizardPlan["content"]["columns"][number]) => WizardPlan["content"]["columns"][number]) => void;
  onUpdateTask: (columnId: string, taskId: string, patch: Partial<WizardPlan["content"]["columns"][number]["tasks"][number]>) => void;
  onMoveTask: (sourceColumnId: string, targetColumnId: string, taskId: string, targetIndex: number) => void;
  onUpdateDetails: (patch: Pick<ProjectPlanSnapshotData, "name" | "description">) => void;
}) {
  const [editingTask, setEditingTask] = useState<{ columnId: string; taskId: string } | null>(null);
  return <section aria-label="Edit attached plan" className="flex min-h-0 flex-1 flex-col gap-4 rounded-xl border border-border/80 bg-muted/15 p-4">
    <div className="grid shrink-0 gap-4">
      <Field id="attached-plan-name" label="Plan name"><Input id="attached-plan-name" maxLength={120} value={value.name} onChange={(event) => onUpdateDetails({ name: event.target.value, description: value.description })}/></Field>
      <Field id="attached-plan-description" label="Plan description"><Textarea id="attached-plan-description" maxLength={1500} value={value.description} onChange={(event) => onUpdateDetails({ name: value.name, description: event.target.value })} className="min-h-10"/></Field>
    </div>
    <div className="min-h-0 flex-1 overflow-auto pb-2"><div className="flex min-w-full items-start gap-3">{value.content.columns.map((column, columnIndex) => <section key={column.id} aria-label={`Edit ${column.name} stage`} onDragOver={(event) => { if (column.type !== "done") event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (column.type === "done") return; const payload = event.dataTransfer.getData("application/worksync-contract-plan-task"); if (!payload) return; event.stopPropagation(); try { const dragged = JSON.parse(payload) as { sourceColumnId: string; taskId: string }; if (value.content.columns.find((item) => item.id === dragged.sourceColumnId)?.type === "done") return; onMoveTask(dragged.sourceColumnId, column.id, dragged.taskId, column.tasks.length); } catch { /* Ignore malformed drag payloads. */ } }} className={`w-[19rem] shrink-0 grow rounded-xl border border-border/80 border-t-2 bg-muted/25 p-3 ${columnIndex % 3 === 0 ? "border-t-emerald-400/60" : columnIndex % 3 === 1 ? "border-t-sky-300/50" : "border-t-primary/40"} ${column.type === "done" ? "cursor-not-allowed opacity-80" : ""}`}>
      <header className="mb-3 flex items-center gap-2"><Input aria-label={`${column.name} stage name`} maxLength={80} value={column.name} onChange={(event) => onUpdateColumn(column.id, (current) => ({ ...current, name: event.target.value }))} className="h-9 border-transparent bg-transparent px-2 font-semibold shadow-none focus-visible:border-input"/><Badge variant="secondary" className="shrink-0">{column.tasks.length}</Badge></header>
      <div className="space-y-2">{column.tasks.map((task, taskIndex) => { const invalid = invalidTaskIds.has(task.id); return <button key={task.id} type="button" draggable={column.type !== "done"} onDragStart={(event) => { if (column.type === "done") { event.preventDefault(); return; } event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/worksync-contract-plan-task", JSON.stringify({ sourceColumnId: column.id, taskId: task.id })); }} onDragOver={(event) => { if (column.type !== "done") event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (column.type === "done") return; const payload = event.dataTransfer.getData("application/worksync-contract-plan-task"); if (!payload) return; event.stopPropagation(); try { const dragged = JSON.parse(payload) as { sourceColumnId: string; taskId: string }; if (value.content.columns.find((item) => item.id === dragged.sourceColumnId)?.type === "done") return; onMoveTask(dragged.sourceColumnId, column.id, dragged.taskId, taskIndex); } catch { /* Ignore malformed drag payloads. */ } }} onClick={() => setEditingTask({ columnId: column.id, taskId: task.id })} title={column.type === "done" ? "Tasks cannot be moved into or out of the Done stage during contract creation." : invalid ? "Task exceeds the contract timeline. Edit it before moving it to a later stage." : undefined} className={`block w-full cursor-pointer rounded-lg border ${invalid ? "border-destructive ring-1 ring-destructive" : "border-border/70"} bg-card p-3 text-left shadow-sm transition hover:border-primary/50 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
        <span className="flex items-start justify-between gap-2"><span className="font-medium">{task.title || "Untitled task"}</span><span className="flex items-center gap-1"><GripVertical className="size-4 shrink-0 text-muted-foreground" aria-label="Drag to reorder or move task"/><Pencil className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/></span></span>
        {task.description && <span className="mt-2 block line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{task.description}</span>}
        <span className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">{task.priority} priority</Badge>{task.expectedDays != null && <span>Estimated {task.expectedDays} {task.expectedDays === 1 ? "day" : "days"}</span>}{task.dueDate && <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5"/>{new Date(`${task.dueDate}T12:00:00`).toLocaleDateString()}</span>}</span>
      </button>; })}</div>
      {column.tasks.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No tasks in this stage</p>}
    </section>)}</div></div>
    <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
      <DialogContent>
        {editingTask && (() => {
          const task = value.content.columns.find((item) => item.id === editingTask.columnId)?.tasks.find((item) => item.id === editingTask.taskId);
          if (!task) return null;
          return <>
            <DialogHeader><DialogTitle>Edit task</DialogTitle><DialogDescription>Update this proposed task for the contract plan.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <Field id="wizard-task-title" label="Task title"><Input id="wizard-task-title" maxLength={160} value={task.title} onChange={(event) => onUpdateTask(editingTask.columnId, task.id, { title: event.target.value })}/></Field>
              <Field id="wizard-task-description" label="Description"><Textarea id="wizard-task-description" maxLength={1000} value={task.description} onChange={(event) => onUpdateTask(editingTask.columnId, task.id, { description: event.target.value })}/></Field>
              <Field id="wizard-task-priority" label="Priority"><select id="wizard-task-priority" value={task.priority} onChange={(event) => onUpdateTask(editingTask.columnId, task.id, { priority: event.target.value as typeof task.priority })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
              <Field id="wizard-task-estimated-days" label="Estimated days" error={task.expectedDays != null && task.expectedDays > deliveryDaysBetween(startDate, deadline) ? `Estimate must fit within ${deliveryDaysBetween(startDate, deadline)} available days.` : ""}><Input id="wizard-task-estimated-days" type="number" min={1} max={3650} step={1} inputMode="numeric" required aria-invalid={invalidTaskIds.has(task.id)} className={invalidTaskIds.has(task.id) ? "border-destructive focus-visible:ring-destructive" : ""} value={task.expectedDays ?? ""} onKeyDown={(event) => { if (event.key === "." || event.key === ",") event.preventDefault(); }} onChange={(event) => { const raw = event.target.value; if (raw === "") { onUpdateTask(editingTask.columnId, task.id, { expectedDays: undefined }); return; } const expectedDays = Number(raw); if (Number.isInteger(expectedDays) && expectedDays >= 1 && expectedDays <= 3650) onUpdateTask(editingTask.columnId, task.id, { expectedDays }); }}/></Field>
            </div>
            <DialogFooter><Button type="button" disabled={!Number.isInteger(task.expectedDays) || (task.expectedDays ?? 0) < 1 || (task.expectedDays ?? 0) > 3650} onClick={() => setEditingTask(null)}>Done</Button></DialogFooter>
          </>;
        })()}
      </DialogContent>
    </Dialog>
  </section>;
}

function MilestonePlanAgreementSection({ projectType, status, budget, deadline, milestones, tasks, clientAgreed, freelancerAgreed, currentParty, clientLabel, freelancerLabel, updating, reviewed, onReviewedChange, onRequestRevision, onChange, onAgree, headerAction, navigation }: {
  projectType?: "standard" | "milestone";
  status?: JobMilestonePlanAgreement & { currentParty: "client" | "freelancer"; updating: boolean; error?: string };
  budget: number;
  deadline: string;
  milestones: ContractVersionMilestoneInput[];
  tasks: Array<{ id: string; stage: string; title: string; description: string }>;
  clientAgreed: boolean;
  freelancerAgreed: boolean;
  currentParty: "client" | "freelancer";
  clientLabel: string;
  freelancerLabel: string;
  updating: boolean;
  reviewed: boolean;
  onReviewedChange: (checked: boolean) => void;
  onRequestRevision: () => void;
  onChange: (milestones: ContractVersionMilestoneInput[]) => void;
  onAgree: () => void;
  headerAction?: React.ReactNode;
  navigation?: React.ReactNode;
}) {
  const [draftTaskId, setDraftTaskId] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  if (projectType !== "milestone") return null;
  const total = milestones.reduce((sum, milestone) => sum + (Number.isFinite(milestone.amount) ? milestone.amount : 0), 0);
  const totalMatches = Math.round(total * 100) === Math.round(budget * 100);
  const totalExceedsBudget = Math.round(total * 100) > Math.round(budget * 100);
  const hasPositiveAmounts = milestones.every((milestone) => Number.isFinite(milestone.amount) && milestone.amount > 0);
  const myApproval = currentParty === "client" ? clientAgreed : freelancerAgreed;
  const remainingBudget = Math.round((budget - total) * 100) / 100;
  const editingMilestone = milestones.find((milestone) => milestone.id === editingMilestoneId);
  const draftBudgetLimit = Math.max(0, remainingBudget + (editingMilestone?.amount ?? 0));
  const draftTask = tasks.find((task) => task.id === draftTaskId);
  const assignedTaskIds = new Set(milestones.flatMap((milestone) => {
    if (milestone.id === editingMilestoneId) return [];
    return milestone.taskIds ?? [];
  }));
  const draftAmountValue = Number(draftAmount);
  const canAddMilestone = Boolean(
    !updating && !myApproval && (!editingMilestone || draftTask) && (!draftTask || !assignedTaskIds.has(draftTask.id)) &&
    Number.isFinite(draftAmountValue) && draftAmountValue > 0 && draftAmountValue <= draftBudgetLimit,
  );
  const visibleMilestones = milestones.filter((milestone) => {
    const task = findTaskForMilestone(milestone, tasks);
    return task || milestone.amount > 0;
  });
  const addMilestone = () => {
    if (!canAddMilestone) return;
    if (editingMilestone) {
      onChange(milestones.map((milestone) => milestone.id === editingMilestone.id
        ? { ...milestone, title: draftTask!.title, description: draftTask!.description, amount: draftAmountValue, taskIds: [...new Set([...(milestone.taskIds ?? []), draftTask!.id])] }
        : milestone));
      setEditingMilestoneId(null);
      setDraftTaskId("");
      setDraftAmount("");
      return;
    }
    const existing = milestones.filter((milestone) => {
      const task = findTaskForMilestone(milestone, tasks);
      return task || milestone.amount > 0;
    });
    const next = {
      id: globalThis.crypto.randomUUID(), title: draftTask?.title ?? `Milestone ${existing.length + 1}`, description: draftTask?.description ?? "", amount: draftAmountValue, taskIds: draftTask ? [draftTask.id] : [],
      dueDate: deadline || null, displayOrder: existing.length + 1,
    };
    onChange([...existing, next]);
    setEditingMilestoneId(null);
    setDraftTaskId("");
    setDraftAmount("");
  };
  const hasTaskSelections = milestones.length > 0 && milestones.every((milestone) =>
    (milestone.taskIds ?? []).some((taskId) => tasks.some((task) => task.id === taskId)),
  );
  return <section aria-label="Milestone plan and agreement" className="min-w-0 space-y-3 rounded-xl border border-border/80 bg-muted/15 p-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold">Milestone plan</h2><p className="mt-1 text-sm text-muted-foreground">Split the project budget into deliverables. Both parties must approve the same schedule before continuing.</p></div>
      {headerAction}
    </div>
    {tasks.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Add tasks to the freelancer&#39;s plan before creating milestones.</p> : <div className="grid gap-2 rounded-lg border bg-card/60 p-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(180px,1fr)] sm:items-start">
      <Field compact id="milestone-new-task" label="Milestone task (optional)"><select id="milestone-new-task" value={draftTaskId} disabled={updating || myApproval} onChange={(event) => setDraftTaskId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"><option value="">Choose a plan task</option>{tasks.map((task) => <option key={task.id} value={task.id} disabled={assignedTaskIds.has(task.id)}>{task.stage} Â· {task.title}{assignedTaskIds.has(task.id) ? " (already assigned)" : ""}</option>)}</select></Field>
      <Field compact id="milestone-new-amount" label="Budget amount (PHP)"><Input className="h-9" id="milestone-new-amount" type="number" min="0.01" max={draftBudgetLimit} step="0.01" value={draftAmount} disabled={updating || myApproval || draftBudgetLimit <= 0} placeholder="0.00" onChange={(event) => { const value = event.target.value === "" ? "" : Number(event.target.value); if (value === "") setDraftAmount(""); else if (Number.isFinite(value) && value > 0) setDraftAmount(String(Math.min(value, draftBudgetLimit))); }}/></Field>
    </div>}
    <div className="flex justify-end gap-2">{editingMilestoneId && <Button type="button" size="sm" variant="ghost" onClick={() => { setEditingMilestoneId(null); setDraftTaskId(""); setDraftAmount(""); }}>Cancel edit</Button>}<Button type="button" size="sm" variant="outline" disabled={!canAddMilestone} title={editingMilestone && !draftTask ? "Choose a plan task for this milestone." : draftBudgetLimit <= 0 ? "Edit a milestone and lower its budget to free funds first." : "Enter a positive amount within the available budget."} onClick={addMilestone}>{editingMilestone ? <><Check className="size-4"/>Update milestone</> : <><Plus className="size-4"/>Add milestone</>}</Button></div>
    {visibleMilestones.length > 0 && <div className="divide-y rounded-lg border bg-card/30">{visibleMilestones.map((milestone, index) => {
      const task = findTaskForMilestone(milestone, tasks);
      const selected = editingMilestoneId === milestone.id;
      const beginEdit = () => { if (myApproval) onRequestRevision(); setEditingMilestoneId(milestone.id); setDraftTaskId(task?.id ?? ""); setDraftAmount(String(milestone.amount)); };
      return <div key={milestone.id} className={`flex items-center gap-3 px-3 py-3 transition-colors ${selected ? "bg-primary/5" : "hover:bg-muted/30"}`}>
        <button type="button" aria-pressed={selected} disabled={updating} onClick={beginEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className={`size-4 shrink-0 rounded-full border ${selected ? "border-primary bg-primary" : "border-muted-foreground/50"}`} aria-hidden="true"/>
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{task ? `${task.stage} Â· ${task.title}` : `Milestone ${index + 1}`}</span><span className="block truncate text-xs text-muted-foreground">{task?.description || (task ? "No task description." : "Choose a task from the plan.")}</span></span>
        </button>
        <span className={`shrink-0 text-right text-sm font-medium ${totalExceedsBudget ? "text-destructive" : "text-foreground"}`}>PHP {milestone.amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={updating || myApproval} aria-label={`Remove milestone ${index + 1}`} title={`Remove milestone ${index + 1}`} onClick={() => { onChange(milestones.filter((item) => item.id !== milestone.id).map((item, itemIndex) => ({ ...item, displayOrder: itemIndex + 1 }))); if (editingMilestoneId === milestone.id) { setEditingMilestoneId(null); setDraftTaskId(""); setDraftAmount(""); } }}><X className="size-4"/></Button>
      </div>;
    })}</div>}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm"><span className="text-muted-foreground">Allocated budget</span><span className={`font-medium ${totalMatches ? "text-emerald-500" : totalExceedsBudget ? "text-destructive" : "text-muted-foreground"}`}>PHP {total.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / PHP {budget.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
    {!totalMatches && milestones.length > 0 && <p className="text-xs text-muted-foreground">Milestone amounts must total the agreed project budget.</p>}
    {status?.error && <p role="alert" className="text-sm text-destructive">Milestone agreement status could not be loaded: {status.error}</p>}
    {status?.changedBy && !(clientAgreed && freelancerAgreed) && status.previousMilestones.length > 0 && <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"><p className="text-sm font-medium">{status.milestones.length === 0 ? "The basic terms changed and the previous milestone plan was cleared. Create a new plan and get both parties to agree." : `${status.changedBy === "client" ? "The client" : "The freelancer"} changed the milestone plan. Both parties must review and agree again.`}</p>{milestonePlanChanges(status.previousMilestones, status.milestones).map((change, index) => <p key={`${index}:${change}`} className="rounded-md bg-background/60 px-2.5 py-2 text-sm">{change}</p>)}</div>}
    <div className="grid gap-2 sm:grid-cols-2"><div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm"><span>{clientLabel}</span><Badge variant={clientAgreed ? "secondary" : "outline"}>{clientAgreed ? "Agreed" : "Pending"}</Badge></div><div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm"><span>{freelancerLabel}</span><Badge variant={freelancerAgreed ? "secondary" : "outline"}>{freelancerAgreed ? "Agreed" : "Pending"}</Badge></div></div>
    <label className="flex cursor-pointer items-start gap-3 text-sm"><Checkbox checked={reviewed} disabled={updating || myApproval} onCheckedChange={(checked) => onReviewedChange(checked === true)} className="mt-0.5 size-5"/><span>I agree to this milestone schedule and budget split.</span></label>

    {clientAgreed && freelancerAgreed && <p className="text-sm text-emerald-500">Both parties agreed to the milestone plan.</p>}
    <Button type="button" className="w-full" disabled={updating || myApproval || !reviewed || !hasTaskSelections || !hasPositiveAmounts || !totalMatches} title={!hasTaskSelections ? "Choose a plan task for each milestone." : !totalMatches ? "Milestone amounts must equal the agreed project budget." : !reviewed ? "Check the agreement box above first." : undefined} onClick={onAgree}>{updating ? "Saving milestone agreement..." : myApproval ? "Agreed to milestone plan" : "Agree to milestone plan"}</Button>
    {navigation}
  </section>;
}
