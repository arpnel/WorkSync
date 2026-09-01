"use client";

import { ArrowLeft, ListChecks, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectAgreementCard } from "@/components/project/ProjectAgreementCard";
import { ProjectChatPanel } from "@/components/project/ProjectChatPanel";
import { useProjectWorkspace } from "@/hooks/project/useProjectWorkspace";
import { MilestoneWorkspaceList } from "./MilestoneWorkspaceList";

export function MilestoneProjectWorkspace({ orderId }: { orderId: string }) {
  const router = useRouter();
  const {
    workspace,
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
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Loading project...
      </div>
    );
  if (error || !workspace)
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

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-5 px-4 sm:px-6 lg:px-8">
      <header className="flex min-w-0 items-start gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => router.push("/home/projects")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold sm:text-2xl">
              {workspace.title}
            </h1>
            <Badge variant="secondary">
              <ListChecks className="mr-1 h-3.5 w-3.5" />
              Milestone
            </Badge>
            <Badge variant="outline" className="capitalize">
              {workspace.status}
            </Badge>
          </div>
          {workspace.description && (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {workspace.description}
            </p>
          )}
        </div>
      </header>

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

      <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-[minmax(300px,0.85fr)_minmax(360px,1.05fr)_minmax(300px,0.8fr)] 2xl:items-start">
        <ProjectChatPanel
          className="h-[720px] min-h-[620px] 2xl:sticky 2xl:top-4"
          messages={workspace.messages}
          sending={sending}
          isOtherParticipantTyping={isOtherParticipantTyping}
          onSend={sendMessage}
          onTypingChange={sendTyping}
        />
        <MilestoneWorkspaceList
          project={workspace}
          updatingApprovalKey={updatingApprovalKey}
          onRespondItem={respondToAgreementItem}
        />
        <aside className="grid gap-5 xl:col-span-2 xl:grid-cols-2 2xl:col-span-1 2xl:block 2xl:space-y-5">
          <ProjectAgreementCard
            project={workspace}
            updating={updatingAgreement}
            updatingApprovalKey={updatingApprovalKey}
            onRespond={respondToAgreement}
            onRespondItem={respondToAgreementItem}
            onSaveItem={saveAgreementItem}
          />
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
