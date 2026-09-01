"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    updatingApprovalKey,
    isOtherParticipantTyping,
    error,
    sendMessage,
    sendTyping,
    respondToAgreement,
    respondToAgreementItem,
    saveAgreementTerms,
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

  const bothAgreed =
    Boolean(workspace.clientSignedAt) && Boolean(workspace.freelancerSignedAt);

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Back to projects"
              onClick={() => router.push("/home/projects")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">
                {workspace.title}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {workspace.clientName} and {workspace.freelancerName}
              </p>
            </div>
          </div>
          <Badge variant={bothAgreed ? "secondary" : "outline"}>
            {bothAgreed ? "Agreed" : "In discussion"}
          </Badge>
        </div>
        {workspace.description && (
          <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">
            {workspace.description}
          </p>
        )}
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(380px,0.8fr)_minmax(600px,1.2fr)] xl:items-start">
        <ProjectChatPanel
          className="h-[700px] min-h-[700px]"
          messages={workspace.messages}
          sending={sending}
          isOtherParticipantTyping={isOtherParticipantTyping}
          onSend={sendMessage}
          onTypingChange={sendTyping}
        />
        <StandardProjectSummary
          project={workspace}
          updatingAgreement={updatingAgreement}
          updatingApprovalKey={updatingApprovalKey}
          onRespond={respondToAgreement}
          onRespondItem={respondToAgreementItem}
          onSaveTerms={saveAgreementTerms}
        />
      </div>
    </div>
  );
}
