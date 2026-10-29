"use client";
import { useState } from "react";
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

export function StandardProjectWorkspace({
  serviceOrderId,
  initialAgreementView = false,
}: {
  serviceOrderId: string;
  initialAgreementView?: boolean;
}) {
  const router = useRouter();
  const [showExistingAgreement, setShowExistingAgreement] = useState(initialAgreementView);
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
  if (isPendingAgreement && !showExistingAgreement) {
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
