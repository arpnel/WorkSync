"use client";
import { ProjectMeetingsDialog } from "@/components/project/ProjectMeetingsDialog";
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
import { ProjectChatPanel } from "@/components/project/ProjectChatPanel";
import { ProjectWorkspaceHeader } from "@/components/project/ProjectWorkspaceHeader";
import { useProjectWorkspace } from "@/hooks/project/useProjectWorkspace";
import { MilestoneWorkspaceList } from "./MilestoneWorkspaceList";

export function MilestoneProjectWorkspace({ orderId }: { orderId: string }) {
  const router = useRouter();
  const {
    workspace,
    refresh,
    loading,
    sending,
    updatingAgreement,
    updatingApprovalKey,
    isOtherParticipantTyping,
    error,
    sendMessage,
    sendTyping,
    respondToAgreement,
    respondToAgreementItem,
    saveAgreementItem,
  } = useProjectWorkspace(orderId);

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

  if (
    ["active", "revision", "completed"].includes(workspace.status.toLowerCase())
  ) {
    return (
      <ActiveProjectWorkspace
        project={workspace}
        onRefresh={refresh}
        error={error}
        onBack={() => router.push("/home/projects")}
        chat={
          <ProjectChatPanel
            conversationId={workspace.conversationId}
            className="h-[min(65dvh,560px)] min-h-[380px]"
            headerActions={
              workspace.projectId ? (
                <ProjectMeetingsDialog
                  projectId={workspace.projectId}
                  active={workspace.status.toLowerCase() !== "completed"}
                />
              ) : undefined
            }
            messages={workspace.messages}
            sending={sending}
            isOtherParticipantTyping={isOtherParticipantTyping}
            onSend={sendMessage}
            onTypingChange={sendTyping}
          />
        }
      />
    );
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

      {!["active", "revision", "completed", "cancelled"].includes(
        workspace.status.toLowerCase(),
      ) && (
        <MilestonePlanningForm
          orderId={workspace.orderId}
          milestones={workspace.milestones}
          onRefresh={refresh}
        />
      )}
      {workspace.projectId && (
        <ProjectMeetings
          key={workspace.projectId}
          projectId={workspace.projectId}
          active={workspace.status.toLowerCase() === "active"}
        />
      )}
      <ProjectResolutionPanel
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
      <ContractSummary project={workspace} />
      <ProjectPaymentPanel project={workspace} />
      <ProjectDeliveryPanel
        key={workspace.projectId ?? workspace.orderId}
        project={workspace}
        onRefresh={refresh}
      />

      <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-[minmax(300px,0.85fr)_minmax(360px,1.05fr)_minmax(300px,0.8fr)] 2xl:items-start">
        <ProjectChatPanel
          conversationId={workspace.conversationId}
          className="h-[720px] min-h-[620px] 2xl:sticky 2xl:top-4"
          messages={workspace.messages}
          sending={sending}
          isOtherParticipantTyping={isOtherParticipantTyping}
          onSend={sendMessage}
          onTypingChange={sendTyping}
        />
        <fieldset
          className="min-w-0"
          disabled={["active", "revision", "completed", "cancelled"].includes(
            workspace.status.toLowerCase(),
          )}
        >
          <MilestoneWorkspaceList
            project={workspace}
            updatingApprovalKey={updatingApprovalKey}
            onRespondItem={respondToAgreementItem}
          />
        </fieldset>
        <aside className="grid gap-5 xl:col-span-2 xl:grid-cols-2 2xl:col-span-1 2xl:block 2xl:space-y-5">
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
        </aside>
      </div>
    </div>
  );
}
