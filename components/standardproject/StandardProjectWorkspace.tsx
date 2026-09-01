"use client";

import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  RotateCcw,
  Users,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectAgreementCard } from "@/components/project/ProjectAgreementCard";
import { ProjectChatPanel } from "@/components/project/ProjectChatPanel";
import { useProjectWorkspace } from "@/hooks/project/useProjectWorkspace";

export function StandardProjectWorkspace({ orderId }: { orderId: string }) {
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

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Loading project...
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="py-16 text-center text-sm text-destructive">
        {error ?? "Project not found."}
      </div>
    );
  }

  if (workspace.type !== "standard") return null;

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-5 px-4 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Back to projects"
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
                <BriefcaseBusiness className="mr-1 h-3.5 w-3.5" />
                Standard
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
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-[minmax(320px,0.9fr)_minmax(380px,1.1fr)_minmax(280px,0.75fr)] 2xl:items-start">
        <ProjectChatPanel
          className="h-[720px] min-h-[620px] 2xl:sticky 2xl:top-4"
          messages={workspace.messages}
          sending={sending}
          isOtherParticipantTyping={isOtherParticipantTyping}
          onSend={sendMessage}
          onTypingChange={sendTyping}
        />

        <ProjectAgreementCard
          project={workspace}
          updating={updatingAgreement}
          updatingApprovalKey={updatingApprovalKey}
          onRespond={respondToAgreement}
          onRespondItem={respondToAgreementItem}
          onSaveItem={saveAgreementItem}
        />

        <aside className="grid gap-5 xl:col-span-2 xl:grid-cols-2 2xl:col-span-1 2xl:block 2xl:space-y-5">
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Participants
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Client</p>
                <p className="mt-1 font-medium">{workspace.clientName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Freelancer</p>
                <p className="mt-1 font-medium">{workspace.freelancerName}</p>
              </div>
              {workspace.description && (
                <p className="border-t pt-3 leading-6 text-muted-foreground">
                  {workspace.description}
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
