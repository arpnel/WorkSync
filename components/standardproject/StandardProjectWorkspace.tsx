"use client";
import { useEffect, useState } from "react";
import ContentSkeleton from "@/components/shared/ContentSkeleton";

import { CalendarDays, RotateCcw, Wallet } from "lucide-react";
import ProjectMeetings from "@/components/project/ProjectMeetings";
import { ProjectChatPanel } from "@/components/project/ProjectChatPanel";
import { ProjectResolutionPanel } from "@/components/project/ProjectResolutionPanel";
import { ActiveProjectWorkspace } from "@/components/project/ActiveProjectWorkspace";
import { ProjectDeliveryPanel } from "@/components/project/ProjectDeliveryPanel";
import { ProjectPaymentPanel } from "@/components/project/ProjectPaymentPanel";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContractSummary } from "@/components/project/ContractSummary";
import { ProjectAgreementCard } from "@/components/project/ProjectAgreementCard";
import { ProjectWorkspaceHeader } from "@/components/project/ProjectWorkspaceHeader";
import { CancelledProjectWorkspace } from "@/components/project/CancelledProjectWorkspace";
import { useProjectWorkspace } from "@/hooks/project/useProjectWorkspace";
import { JobAgreementWizard } from "@/components/project/JobAgreementWizard";
import { deleteContractCreationDraft } from "@/services/project/contractCreationDraftService";
import { saveContractVersionForAgreement } from "@/services/project/projectWorkspaceService";
import { sendConversationMessage } from "@/services/message/messageService";
import {
  agreeToJobBasicTerms,
  getJobBasicTermsAgreement,
  type JobBasicTerms,
  type JobBasicTermsAgreement,
} from "@/services/project/jobBasicTermsAgreementService";

export function StandardProjectWorkspace({
  serviceOrderId,
  initialAgreementView = false,
}: {
  serviceOrderId: string;
  initialAgreementView?: boolean;
}) {
  const router = useRouter();
  const [showExistingAgreement, setShowExistingAgreement] = useState(initialAgreementView);
  const [basicAgreementLoading, setBasicAgreementLoading] = useState(false);
  const [basicAgreement, setBasicAgreement] = useState<(JobBasicTermsAgreement & {
    currentParty: "client" | "freelancer";
    updating: boolean;
    error?: string;
  }) | null>(null);
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
  const basicTermsApplicationId = workspace?.applicationId ?? null;
  const basicTermsCurrentParty = workspace?.currentParty;

  useEffect(() => {
    const applicationId = basicTermsApplicationId;
    if (!applicationId || !basicTermsCurrentParty) {
      setBasicAgreement(null);
      setBasicAgreementLoading(false);
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const saved = await getJobBasicTermsAgreement(applicationId);
        if (active) setBasicAgreement({
          ...saved,
          currentParty: basicTermsCurrentParty,
          updating: false,
        });
      } catch (cause) {
        if (active) setBasicAgreement({
          terms: null,
          clientAgreed: false,
          freelancerAgreed: false,
          currentParty: basicTermsCurrentParty,
          updating: false,
          error: cause instanceof Error ? cause.message : "Basic terms agreement could not be loaded.",
        });
      } finally {
        if (active) setBasicAgreementLoading(false);
      }
    };
    setBasicAgreementLoading(true);
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 10000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [basicTermsApplicationId, basicTermsCurrentParty]);

  const agreeToBasics = async (terms: JobBasicTerms) => {
    if (!workspace?.applicationId) throw new Error("Application details are unavailable.");
    setBasicAgreement((current) => current ? { ...current, updating: true } : current);
    try {
      const saved = await agreeToJobBasicTerms(workspace.applicationId, terms);
      setBasicAgreement({ ...saved, currentParty: workspace.currentParty, updating: false });
      return saved;
    } catch (cause) {
      setBasicAgreement((current) => current ? { ...current, updating: false } : current);
      throw cause;
    }
  };

  if (loading) {
    return <ContentSkeleton label="Loading project" variant="workspace" />;
  }

  if (!workspace) {
    return (
      <div className="py-16 text-center text-sm text-destructive">
        {error ?? "Project not found."}
      </div>
    );
  }

  if (workspace.type !== "standard") return null;

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
        error={error}
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
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const hasPastMilestoneDate = workspace.milestones.some(
    (milestone) => milestone.dueDate && milestone.dueDate.slice(0, 10) < todayKey,
  );
  if (isPendingAgreement && workspace.applicationId && basicAgreementLoading) {
    return <ContentSkeleton label="Loading agreement approvals" variant="workspace" />;
  }
  const bothBasicPartiesAgreed = Boolean(
    basicAgreement?.clientAgreed && basicAgreement?.freelancerAgreed,
  );
  if (isPendingAgreement && (!showExistingAgreement || (workspace.applicationId && !bothBasicPartiesAgreed))) {
    return <JobAgreementWizard
      draftKey={`worksync:contract-draft:${workspace.currentUserId}:${workspace.applicationId ?? workspace.contractId ?? workspace.orderId}`}
      draftUserId={workspace.currentUserId}
      initial={{
        title: workspace.title,
        description: workspace.description,
        budget: workspace.budget,
        estimatedDays: workspace.deliveryDays,
        revisions: workspace.revisions,
        deadline: workspace.dueDate,
        startDate: workspace.startDate,
        plan: workspace.proposedPlan,
        planSource: workspace.proposedPlan ? "Submitted application plan" : "No plan selected",
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
      basicAgreementStatus={workspace.applicationId ? basicAgreement ?? {
        currentParty: workspace.currentParty,
        clientAgreed: false,
        freelancerAgreed: false,
        terms: null,
        updating: basicAgreementLoading,
        error: "Refresh the project to load agreement status.",
      } : undefined}
      onAgreeBasics={workspace.applicationId ? agreeToBasics : undefined}
      onAgree={async () => {
        const saved = await respondToAgreement(true);
        if (saved) setShowExistingAgreement(true);
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
        if (!workspace.contractId || !workspace.contractVersion) {
          throw new Error("The current contract version could not be identified.");
        }
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
        void deleteContractCreationDraft(
          `worksync:contract-draft:${workspace.currentUserId}:${workspace.applicationId ?? workspace.contractId ?? workspace.orderId}`,
          workspace.currentUserId,
        ).catch((draftError) => console.warn("Saved contract draft could not be cleared:", draftError));
        await refresh();
        setShowExistingAgreement(true);
      }}
    />;
  }

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-5 px-4 sm:px-6 lg:px-8">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ProjectWorkspaceHeader
        title={workspace.title}
        description={workspace.description}
        categoryName={workspace.categoryName}
        status={workspace.status}
        type={workspace.type}
        clientName={workspace.clientName}
        freelancerName={workspace.freelancerName}
        onBack={() => router.push("/home/projects")}
      />

      {workspace.projectId && (
        <ProjectMeetings
          key={`${workspace.projectId}:meetings`}
          projectId={workspace.projectId}
          active={workspace.status.toLowerCase() === "active"}
        />
      )}

      {workspace.clientSignedAt && workspace.freelancerSignedAt && (
        <ContractSummary project={workspace} />
      )}
      <ProjectPaymentPanel project={workspace} />
      <ProjectDeliveryPanel
        key={`${workspace.projectId ?? workspace.orderId}:delivery`}
        project={workspace}
        onRefresh={refresh}
      />

      <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-[minmax(320px,1fr)_minmax(380px,1fr)] 2xl:items-start">
        <fieldset
          id="contract"
          className="min-w-0"
          disabled={["active", "revision", "completed", "cancelled"].includes(
            workspace.status.toLowerCase(),
          )}
        >
          <ProjectAgreementCard
            project={workspace}
            updating={updatingAgreement}
            updatingApprovalKey={updatingApprovalKey}
            singleAgreement
            onRespond={respondToAgreement}
            onRespondItem={respondToAgreementItem}
            onSaveItem={saveAgreementItem}
          />
        </fieldset>

        <aside className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Wallet className="h-4 w-4" />
                  Budget
                </span>
                <strong>PHP {workspace.budget.toLocaleString()}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="h-4 w-4" />
                  Delivery
                </span>
                <span className="font-medium">
                  {workspace.deliveryDays == null
                    ? "Not set"
                    : `${workspace.deliveryDays} days`}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <RotateCcw className="h-4 w-4" />
                  Revisions
                </span>
                <span className="font-medium">
                  {workspace.revisions ?? "Not set"}
                </span>
              </div>
              <div className="flex justify-between gap-3 border-t pt-4">
                <span className="text-muted-foreground">Deadline</span>
                <span className="font-medium">
                  {workspace.dueDate
                    ? new Date(workspace.dueDate).toLocaleDateString()
                    : "Not set"}
                </span>
              </div>
            </CardContent>
          </Card>

          <ProjectChatPanel
            conversationId={workspace.conversationId}
            messages={workspace.messages}
            hasOlderMessages={workspace.hasOlderMessages}
            loadingOlderMessages={loadingOlderMessages}
            onLoadOlderMessages={loadOlderMessages}
            sending={sending}
            isOtherParticipantTyping={isOtherParticipantTyping}
            onSend={sendMessage}
            onTypingChange={sendTyping}
          />
        </aside>
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
