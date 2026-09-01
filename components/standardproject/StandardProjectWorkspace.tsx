"use client";

import { ArrowLeft, BriefcaseBusiness } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectChatPanel } from "@/components/project/ProjectChatPanel";
import { useProjectWorkspace } from "@/hooks/project/useProjectWorkspace";
import { StandardProjectSummary } from "./StandardProjectSummary";

export function StandardProjectWorkspace({ orderId }: { orderId: string }) {
  const router = useRouter();
  const {
    workspace,
    loading,
    sending,
    updatingAgreement,
    isOtherParticipantTyping,
    error,
    sendMessage,
    sendTyping,
    respondToAgreement,
    saveAgreementTerms,
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
  if (workspace.type !== "standard") return null;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ProjectChatPanel
          messages={workspace.messages}
          sending={sending}
          isOtherParticipantTyping={isOtherParticipantTyping}
          onSend={sendMessage}
          onTypingChange={sendTyping}
        />
        <StandardProjectSummary
          project={workspace}
          updatingAgreement={updatingAgreement}
          onRespond={respondToAgreement}
          onSaveTerms={saveAgreementTerms}
        />
      </div>
    </div>
  );
}
