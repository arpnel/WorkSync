"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import ContentSkeleton from "@/components/shared/ContentSkeleton";

import { MilestonePlanningForm } from "@/components/project/MilestonePlanningForm";
import { Wallet } from "lucide-react";
import ProjectMeetings from "@/components/project/ProjectMeetings";
import { ProjectResolutionPanel } from "@/components/project/ProjectResolutionPanel";
import { ActiveProjectWorkspace } from "@/components/project/ActiveProjectWorkspace";
import { ProjectDeliveryPanel } from "@/components/project/ProjectDeliveryPanel";
import { ProjectPaymentPanel } from "@/components/project/ProjectPaymentPanel";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContractSummary } from "@/components/project/ContractSummary";
import { ProjectAgreementCard } from "@/components/project/ProjectAgreementCard";
import { JobAgreementWizard } from "@/components/project/JobAgreementWizard";
import { ServiceOrderContractCancellationPanel } from "@/components/project/ServiceOrderContractCancellationPanel";
import { ProjectWorkspaceHeader } from "@/components/project/ProjectWorkspaceHeader";
import { useProjectWorkspace } from "@/hooks/project/useProjectWorkspace";
import { MilestoneWorkspaceList } from "./MilestoneWorkspaceList";
import { CancelledProjectWorkspace } from "@/components/project/CancelledProjectWorkspace";
import { activateConfirmedProjectAgreement, saveContractVersionForAgreement } from "@/services/project/projectWorkspaceService";
import { sendConversationMessage } from "@/services/message/messageService";
import { supabase } from "@/lib/supabaseClient";
import { deleteContractCreationDraft } from "@/services/project/contractCreationDraftService";
import {
  agreeToJobBasicTerms,
  agreeToServiceOrderBasicTerms,
  getJobBasicTermsAgreement,
  getServiceOrderBasicTermsAgreement,
  type JobBasicTerms,
  type JobBasicTermsAgreement,
} from "@/services/project/jobBasicTermsAgreementService";
import {
  agreeToJobWorkPlan,
  agreeToServiceOrderWorkPlan,
  getJobWorkPlanAgreement,
  getServiceOrderWorkPlanAgreement,
  type JobWorkPlanAgreement,
} from "@/services/project/jobWorkPlanAgreementService";
import {
  agreeToJobMilestonePlan,
  agreeToServiceOrderMilestonePlan,
  getJobMilestonePlanAgreement,
  getServiceOrderMilestonePlanAgreement,
  type JobMilestonePlanAgreement,
} from "@/services/project/jobMilestonePlanAgreementService";
import type { ProjectPlanSnapshotData } from "@/services/project/projectPlanSnapshot";
import type { ContractVersionMilestoneInput } from "@/services/project/projectWorkspaceService";

export function MilestoneProjectWorkspace({
  serviceOrderId,
}: {
  serviceOrderId: string;
}) {
  const router = useRouter();
  const [activationError, setActivationError] = useState("");
  const [agreementLoading, setAgreementLoading] = useState(true);
  const [cancellationLocked, setCancellationLocked] = useState(false);
  const [basicAgreement, setBasicAgreement] = useState<(JobBasicTermsAgreement & { currentParty: "client" | "freelancer"; updating: boolean; error?: string }) | null>(null);
  const [workPlanAgreement, setWorkPlanAgreement] = useState<(JobWorkPlanAgreement & { currentParty: "client" | "freelancer"; updating: boolean; error?: string }) | null>(null);
  const [milestoneAgreement, setMilestoneAgreement] = useState<(JobMilestonePlanAgreement & { currentParty: "client" | "freelancer"; updating: boolean; error?: string }) | null>(null);
  const activationAttemptedFor = useRef<string | null>(null);
  const {
    workspace,
    refresh,
    loading,
    updatingAgreement,
    updatingApprovalKey,
    sending,
    loadingOlderMessages,
    isOtherParticipantTyping,
    sendMessage,
    loadOlderMessages,
    sendTyping,
    error,
    respondToAgreement,
    respondToAgreementItem,
    saveAgreementItem,
  } = useProjectWorkspace(serviceOrderId);
  const agreementUpdates = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const handleCancellationState = useCallback((locked: boolean, accepted?: boolean) => {
    setCancellationLocked(locked);
    if (accepted) void refresh();
  }, [refresh]);

  useEffect(() => {
    if (workspace?.type === "standard") router.replace(`/home/projects/standard/${serviceOrderId}`);
    if (
      workspace?.type === "milestone" &&
      workspace.applicationId &&
      !(workspace.clientSignedAt && workspace.freelancerSignedAt) &&
      !["active", "revision", "completed", "cancelled", "rejected"].includes(workspace.status.toLowerCase())
    ) {
      router.replace(`/home/projects/create-contract/${workspace.applicationId}`);
    }
  }, [
    router,
    serviceOrderId,
    workspace?.type,
    workspace?.applicationId,
    workspace?.clientSignedAt,
    workspace?.freelancerSignedAt,
    workspace?.status,
  ]);

  useEffect(() => {
    if (!workspace || workspace.type !== "milestone" || !workspace.currentParty) return;
    if (workspace.applicationId) return;
    let active = true;
    setAgreementLoading(true);
    const load = async () => {
      try {
        const [basics, plan, milestones] = await Promise.all([
          getServiceOrderBasicTermsAgreement(workspace.orderId),
          getServiceOrderWorkPlanAgreement(workspace.orderId),
          getServiceOrderMilestonePlanAgreement(workspace.orderId),
        ]);
        if (!active) return;
        setBasicAgreement({ ...basics, currentParty: workspace.currentParty, updating: false });
        setWorkPlanAgreement({ ...plan, currentParty: workspace.currentParty, updating: false });
        setMilestoneAgreement({ ...milestones, currentParty: workspace.currentParty, updating: false });
      } catch (cause) {
        if (active) {
          const message = cause instanceof Error ? cause.message : "Agreement status could not be loaded.";
          setBasicAgreement((value) => value ? { ...value, error: message } : {
            terms: null, previousTerms: null, changedFields: [], changedBy: null,
            clientAgreed: false, freelancerAgreed: false, currentParty: workspace.currentParty, updating: false, error: message,
          });
          setWorkPlanAgreement((value) => value ? { ...value, error: message } : {
            plan: workspace.proposedPlan, previousPlan: null, changedBy: null,
            clientAgreed: false, freelancerAgreed: false,
            hasPlanAgreement: false, currentParty: workspace.currentParty, updating: false, error: message,
          });
          setMilestoneAgreement((value) => value ? { ...value, error: message } : {
            milestones: [], previousMilestones: [], changedBy: null,
            clientAgreed: false, freelancerAgreed: false,
            currentParty: workspace.currentParty, updating: false, error: message,
          });
        }
      } finally {
        if (active) setAgreementLoading(false);
      }
    };
    const channel = supabase.channel(`service-order-milestone-agreements:${workspace.orderId}`)
      .on("broadcast", { event: "agreement-updated" }, () => void load())
      .subscribe();
    agreementUpdates.current = channel;
    void load();
    return () => {
      active = false;
      if (agreementUpdates.current === channel) agreementUpdates.current = null;
      void supabase.removeChannel(channel);
    };
  }, [workspace?.orderId, workspace?.type, workspace?.applicationId, workspace?.currentParty]);

  const broadcastAgreementUpdate = () => void agreementUpdates.current?.send({
    type: "broadcast", event: "agreement-updated", payload: { kind: "milestone-contract" },
  });
  const agreeToBasics = async (terms: JobBasicTerms) => {
    if (!workspace) throw new Error("Contract details are unavailable.");
    setBasicAgreement((value) => value ? { ...value, updating: true, error: undefined } : value);
    try {
      const saved = workspace.applicationId
        ? await agreeToJobBasicTerms(workspace.applicationId, terms)
        : await agreeToServiceOrderBasicTerms(workspace.orderId, terms);
      setBasicAgreement({ ...saved, currentParty: workspace.currentParty, updating: false });
      broadcastAgreementUpdate();
      return saved;
    } catch (cause) {
      setBasicAgreement((value) => value ? { ...value, updating: false, error: cause instanceof Error ? cause.message : "Unable to save basic terms." } : value);
      throw cause;
    }
  };
  const agreeToWorkPlan = async (plan: ProjectPlanSnapshotData) => {
    if (!workspace) throw new Error("Project details are unavailable.");
    setWorkPlanAgreement((value) => value ? { ...value, updating: true, error: undefined } : value);
    try {
      const saved = workspace.applicationId
        ? await agreeToJobWorkPlan(workspace.applicationId, plan)
        : await agreeToServiceOrderWorkPlan(workspace.orderId, plan);
      setWorkPlanAgreement({ ...saved, currentParty: workspace.currentParty, updating: false });
      broadcastAgreementUpdate();
      return saved;
    } catch (cause) {
      setWorkPlanAgreement((value) => value ? { ...value, updating: false, error: cause instanceof Error ? cause.message : "Unable to save the work plan." } : value);
      throw cause;
    }
  };
  const agreeToMilestonePlan = async (milestones: readonly ContractVersionMilestoneInput[]) => {
    if (!workspace) throw new Error("Project details are unavailable.");
    setMilestoneAgreement((value) => value ? { ...value, updating: true, error: undefined } : value);
    try {
      const saved = workspace.applicationId
        ? await agreeToJobMilestonePlan(workspace.applicationId, milestones)
        : await agreeToServiceOrderMilestonePlan(workspace.orderId, milestones);
      setMilestoneAgreement({ ...saved, currentParty: workspace.currentParty, updating: false });
      broadcastAgreementUpdate();
      return saved;
    } catch (cause) {
      setMilestoneAgreement((value) => value ? { ...value, updating: false, error: cause instanceof Error ? cause.message : "Unable to save the milestone plan." } : value);
      throw cause;
    }
  };

  useEffect(() => {
    const contractId = workspace?.contractId;
    if (
      !workspace ||
      !contractId ||
      !workspace.clientSignedAt ||
      !workspace.freelancerSignedAt ||
      ["active", "completed"].includes(workspace.contractStatus ?? "") ||
      activationAttemptedFor.current === contractId
    ) return;

    activationAttemptedFor.current = contractId;
    setActivationError("");
    void activateConfirmedProjectAgreement(workspace.orderId)
      .then((activated) => {
        if (activated) return refresh();
      })
      .catch((cause) => {
        setActivationError(cause instanceof Error ? cause.message : "The confirmed contract could not be activated.");
      });
  }, [workspace?.contractId, workspace?.orderId, workspace?.clientSignedAt, workspace?.freelancerSignedAt, workspace?.contractStatus, refresh]);

  if (loading)
    return <ContentSkeleton label="Loading project" variant="workspace" />;
  if (!workspace)
    return (
      <div className="py-16 text-center text-sm text-destructive">
        {error ?? "Project not found."}
      </div>
    );
  if (workspace.type !== "milestone") return null;

  const milestoneTotal = workspace.milestones.reduce(
    (sum, milestone) => sum + milestone.amount,
    0,
  );

  if (workspace.status.toLowerCase() === "cancelled") {
    return (
      <CancelledProjectWorkspace
        project={workspace}
        error={error}
        onRefresh={refresh}
        onBack={() => router.push("/home/projects")}
      />
    );
  }

  if (
    ["active", "revision", "completed"].includes(workspace.status.toLowerCase())
  ) {
    return (
      <ActiveProjectWorkspace
        project={workspace}
        onRefresh={refresh}
        error={activationError || error}
        onBack={() => router.push("/home/projects")}
      />
    );
  }

  const pendingContractStatuses = ["draft", "pending", "pending_client", "pending_freelancer"];
  const isPendingAgreement = Boolean(
    workspace.contractId &&
    pendingContractStatuses.includes(workspace.contractStatus ?? "") &&
    !(workspace.clientSignedAt && workspace.freelancerSignedAt),
  );
  if (isPendingAgreement && !workspace.applicationId && agreementLoading) {
    return <ContentSkeleton label="Loading agreement approvals" variant="workspace" />;
  }
  if (isPendingAgreement && !workspace.applicationId) {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const hasPastMilestoneDate = workspace.milestones.some(
      (milestone) => milestone.dueDate && milestone.dueDate.slice(0, 10) < todayKey,
    );
    const draftKey = `worksync:contract-draft:${workspace.currentUserId}:${workspace.contractId ?? workspace.orderId}`;
    return <JobAgreementWizard
      clientName={workspace.clientName}
      freelancerName={workspace.freelancerName}
      draftKey={draftKey}
      draftUserId={workspace.currentUserId}
      busy={updatingAgreement || cancellationLocked}
      contractDetailsFooter={<ServiceOrderContractCancellationPanel
        orderId={workspace.orderId}
        currentUserId={workspace.currentUserId}
        otherParticipantName={workspace.currentParty === "client" ? workspace.freelancerName : workspace.clientName}
        onStateChange={handleCancellationState}
      />}
      initial={{
        title: workspace.title,
        description: workspace.description,
        budget: workspace.budget,
        estimatedDays: workspace.deliveryDays,
        revisions: workspace.revisions,
        deadline: workspace.dueDate,
        startDate: workspace.startDate,
        plan: workPlanAgreement?.plan ?? workspace.proposedPlan,
        planSource: workPlanAgreement?.hasPlanAgreement ? "Agreed work plan" : workspace.proposedPlan ? "Submitted project plan" : "No plan selected",
        projectType: "milestone",
      }}
      onBack={() => router.push("/home/projects")}
      agreementStatus={{
        currentParty: workspace.currentParty,
        clientAgreed: Boolean(workspace.clientSignedAt),
        freelancerAgreed: Boolean(workspace.freelancerSignedAt),
        isNew: false,
        hasPastMilestoneDate,
        updating: updatingAgreement,
      }}
      basicAgreementStatus={basicAgreement ?? {
        currentParty: workspace.currentParty,
        clientAgreed: false,
        freelancerAgreed: false,
        terms: null,
        previousTerms: null,
        changedFields: [],
        changedBy: null,
        updating: agreementLoading,
      }}
      onAgreeBasics={agreeToBasics}
      workPlanAgreementStatus={workPlanAgreement ?? undefined}
      onAgreeWorkPlan={agreeToWorkPlan}
      milestoneAgreementStatus={milestoneAgreement ?? undefined}
      onAgreeMilestonePlan={agreeToMilestonePlan}
      onAgree={async () => {
        const saved = await respondToAgreement(true);
        return saved;
      }}
      conversation={{
        conversationId: workspace.conversationId,
        messages: workspace.messages,
        hasOlderMessages: workspace.hasOlderMessages,
        loadingOlderMessages,
        onLoadOlderMessages: loadOlderMessages,
        sending,
        isOtherParticipantTyping,
        onSend: sendMessage,
        onTypingChange: sendTyping,
      }}
      onOpenExistingAgreement={async (proposal, requestId, contractDocument) => {
        if (!workspace.contractId || !workspace.contractVersion) throw new Error("The current contract version could not be identified.");
        await saveContractVersionForAgreement({
          ...proposal,
          contractId: workspace.contractId,
          expectedVersion: workspace.contractVersion,
          requestId,
        });
        if (contractDocument) {
          if (!workspace.conversationId) throw new Error("No agreement conversation is available for the document.");
          await sendConversationMessage(workspace.conversationId, "Attached contract document for review.", contractDocument);
        }
        void deleteContractCreationDraft(draftKey, workspace.currentUserId)
          .catch((draftError) => console.warn("Saved contract draft could not be cleared:", draftError));
        await refresh();
      }}
    />;
  }

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-5 px-4 sm:px-6 lg:px-8">
      {(activationError || error) && (
        <p role="alert" className="text-sm text-destructive">
          {activationError || error}
        </p>
      )}
      <ProjectWorkspaceHeader
        title={workspace.title}
        description={workspace.description}
        categoryName={workspace.categoryName}
        status={workspace.status}
        type={workspace.type}
        onBack={() => router.push("/home/projects")}
      />

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Client</p>
            <p className="mt-1 text-sm font-medium">{workspace.clientName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Freelancer</p>
            <p className="mt-1 text-sm font-medium">
              {workspace.freelancerName}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Requested</p>
            <p className="mt-1 text-sm font-medium">
              {new Date(workspace.createdAt).toLocaleDateString()}
            </p>
          </div>
        </CardContent>
      </Card>

      {workspace.projectId && (
        <ProjectMeetings
          key={workspace.projectId}
          projectId={workspace.projectId}
          active={workspace.status.toLowerCase() === "active"}
        />
      )}

      {workspace.clientSignedAt && workspace.freelancerSignedAt && (
        <ContractSummary project={workspace} />
      )}
      <ProjectPaymentPanel project={workspace} />
      <ProjectDeliveryPanel
        key={workspace.projectId ?? workspace.orderId}
        project={workspace}
        onRefresh={refresh}
      />

      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(280px,0.85fr)_minmax(320px,1fr)_minmax(320px,1fr)]">
        <aside className="min-w-0 space-y-5">
          <fieldset
            className="min-w-0"
            disabled={["active", "revision", "completed", "cancelled"].includes(
              workspace.status.toLowerCase(),
            )}
          >
            <ProjectAgreementCard
              project={workspace}
              updating={updatingAgreement}
              updatingApprovalKey={updatingApprovalKey}
              onRespond={respondToAgreement}
              onRespondItem={respondToAgreementItem}
              onSaveItem={saveAgreementItem}
            />
          </fieldset>
        </aside>
        <fieldset
          className="min-w-0"
          disabled={["active", "revision", "completed", "cancelled"].includes(
            workspace.status.toLowerCase(),
          )}
        >
          <MilestoneWorkspaceList
            onRefresh={
              workspace.status.toLowerCase() !== "cancelled"
                ? refresh
                : undefined
            }
            planning={
              workspace.status.toLowerCase() !== "cancelled" ? (
                <MilestonePlanningForm
                  remainingBudget={workspace.budget - milestoneTotal}
                  previousDueDate={workspace.milestones.at(-1)?.dueDate}
                  orderId={workspace.orderId}
                  onRefresh={refresh}
                />
              ) : undefined
            }
            project={workspace}
            updatingApprovalKey={updatingApprovalKey}
            onRespondItem={respondToAgreementItem}
          />
        </fieldset>
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4" />
                Project Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Project budget</span>
                <strong>PHP {workspace.budget.toLocaleString()}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Milestone total</span>
                <strong>PHP {milestoneTotal.toLocaleString()}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Delivery</span>
                <span className="font-medium">
                  {workspace.deliveryDays == null
                    ? "Not set"
                    : `${workspace.deliveryDays} days`}
                </span>
              </div>
              <div className="flex justify-between gap-3 border-t pt-3">
                <span className="text-muted-foreground">Milestones</span>
                <span className="font-medium">
                  {workspace.milestones.length}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="flex justify-end pt-4">
        <div className="w-full sm:max-w-lg">
          <ProjectResolutionPanel
            compact
            orderStatus={workspace.orderStatus}
            key={workspace.orderId + ":resolution"}
            orderId={workspace.orderId}
            projectId={workspace.projectId}
            status={
              ["active", "revision", "completed", "cancelled"].includes(
                workspace.status.toLowerCase(),
              )
                ? workspace.status
                : workspace.orderStatus
            }
            userId={workspace.currentUserId}
            milestones={workspace.milestones}
            onRefresh={refresh}
          />
        </div>
      </div>
    </div>
  );
}
