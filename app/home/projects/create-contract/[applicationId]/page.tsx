"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { JobAgreementWizard } from "@/components/project/JobAgreementWizard";
import { supabase } from "@/lib/supabaseClient";
import { platformAction } from "@/services/platform/platformService";
import { getProjectRequests, type ProjectRequest } from "@/services/project/projectRequestService";
import {
  getMessageConversations,
  sendConversationMessage,
  subscribeToConversationMessages,
} from "@/services/message/messageService";
import { deleteContractCreationDraft } from "@/services/project/contractCreationDraftService";
import {
  agreeToJobBasicTerms,
  getJobBasicTermsAgreement,
  type JobBasicTerms,
  type JobBasicTermsAgreement,
} from "@/services/project/jobBasicTermsAgreementService";
import {
  agreeToJobMilestonePlan,
  getJobMilestonePlanAgreement,
  type JobMilestonePlanAgreement,
} from "@/services/project/jobMilestonePlanAgreementService";
import {
  saveContractVersionForAgreement,
  createProjectTypingChannel,
  getProjectConversationMessages,
  respondToProjectAgreement,
  type ContractVersionAgreementInput,
} from "@/services/project/projectWorkspaceService";
import type { WorkspaceMessage } from "@/types/project/projectWorkspace";

export default function CreateContractPage() {
  const params = useParams<{ applicationId: string }>();
  const applicationId = params.applicationId;
  const router = useRouter();
  const [request, setRequest] = useState<ProjectRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationUserId, setConversationUserId] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<WorkspaceMessage[]>([]);
  const [conversationError, setConversationError] = useState("");
  const [canCreateAgreement, setCanCreateAgreement] = useState(false);
  const [basicAgreement, setBasicAgreement] = useState<(JobBasicTermsAgreement & {
    currentParty: "client" | "freelancer";
    updating: boolean;
  }) | null>(null);
  const [milestoneAgreement, setMilestoneAgreement] = useState<(JobMilestonePlanAgreement & {
    currentParty: "client" | "freelancer";
    updating: boolean;
    error?: string;
  }) | null>(null);
  const [sending, setSending] = useState(false);
  const [isOtherParticipantTyping, setIsOtherParticipantTyping] = useState(false);
  const sendTypingRef = useRef<(isTyping: boolean) => void>(() => undefined);

  useEffect(() => {
    let current = true;
    let foundApplication = false;
    setLoading(true);
    setRequest(null);
    setError("");
    setConversationId(null);
    setConversationUserId(null);
    setConversationMessages([]);
    setConversationError("");
    setCanCreateAgreement(false);
    setBasicAgreement(null);
    setMilestoneAgreement(null);
    void (async () => {
      try {
        const data = await getProjectRequests();
        const found = [...data.discussions, ...data.received, ...data.sent]
          .find((item) => item.applicationId === applicationId);
        if (!found) throw new Error("This application is unavailable or is no longer accessible.");
        foundApplication = true;
        if (current) setRequest(found);
        try {
          const savedBasics = await getJobBasicTermsAgreement(applicationId);
          if (current) setBasicAgreement({
            ...savedBasics,
            currentParty: found.currentParty,
            updating: false,
          });
        } catch (cause) {
          if (current) {
            setBasicAgreement({
              terms: null,
              clientAgreed: false,
              freelancerAgreed: false,
              currentParty: found.currentParty,
              updating: false,
            });
            setError(cause instanceof Error
              ? `Basic terms agreement could not be loaded: ${cause.message}`
              : "Basic terms agreement could not be loaded.");
          }
        }
        if (found.projectType === "milestone") {
          try {
            const savedPlan = await getJobMilestonePlanAgreement(applicationId);
            if (current) setMilestoneAgreement({ ...savedPlan, currentParty: found.currentParty, updating: false });
          } catch (cause) {
            if (current) setMilestoneAgreement({ milestones: [], clientAgreed: false, freelancerAgreed: false, currentParty: found.currentParty, updating: false, error: cause instanceof Error ? cause.message : "Milestone agreement could not be loaded." });
          }
        }
        const existingOrder = await supabase
          .from("service_orders")
          .select("order_id")
          .eq("application_id", applicationId)
          .maybeSingle();
        if (current)
          setCanCreateAgreement(
            !existingOrder.error && !existingOrder.data && found.currentParty === "client",
          );
        const { currentUserId, conversations } = await getMessageConversations();
        const otherParticipantId = found.currentParty === "client"
          ? found.freelancerUserId
          : found.clientUserId;
        const sharedConversation = conversations.find(
          (item) => item.jobId === found.jobId && item.participant.userId === otherParticipantId,
        );
        if (!sharedConversation) {
          if (current) setConversationError("No shared conversation was found for this application.");
          return;
        }
        const messages = await getProjectConversationMessages(
          sharedConversation.conversationId,
          currentUserId,
        );
        if (current) {
          setConversationId(sharedConversation.conversationId);
          setConversationUserId(currentUserId);
          setConversationMessages(messages);
        }
      } catch (cause) {
        if (current) {
          const message = cause instanceof Error ? cause.message : "Unable to load this application.";
          if (!foundApplication) setError(message);
          else setConversationError("Unable to load the shared conversation. Please reopen this page and try again.");
        }
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => { current = false; };
  }, [applicationId]);

  const refreshConversationMessages = useCallback(async () => {
    if (!conversationId || !conversationUserId) return;
    try {
      const messages = await getProjectConversationMessages(conversationId, conversationUserId);
      setConversationMessages(messages);
    } catch (cause) {
      console.warn("Unable to refresh agreement conversation:", cause instanceof Error ? cause.message : cause);
    }
  }, [conversationId, conversationUserId]);

  useEffect(() => {
    if (!conversationId || !conversationUserId) return;
    const unsubscribe = subscribeToConversationMessages(
      conversationId,
      () => void refreshConversationMessages(),
      "INSERT",
    );
    const typing = createProjectTypingChannel(
      conversationId,
      conversationUserId,
      setIsOtherParticipantTyping,
    );
    sendTypingRef.current = typing.sendTyping;
    return () => {
      typing.sendTyping(false);
      sendTypingRef.current = () => undefined;
      unsubscribe();
      void supabase.removeChannel(typing.channel);
    };
  }, [conversationId, conversationUserId, refreshConversationMessages]);

  const onTypingChange = useCallback((isTyping: boolean) => {
    sendTypingRef.current(isTyping);
  }, []);

  const agreeToBasics = useCallback(async (terms: JobBasicTerms) => {
    if (!request) throw new Error("Application details are unavailable.");
    setBasicAgreement((current) => current ? { ...current, updating: true } : current);
    try {
      const saved = await agreeToJobBasicTerms(applicationId, terms);
      const next = {
        ...saved,
        currentParty: request.currentParty,
        updating: false,
      } as const;
      setBasicAgreement(next);
      return saved;
    } catch (cause) {
      setBasicAgreement((current) => current ? { ...current, updating: false } : current);
      throw cause;
    }
  }, [applicationId, request]);

  const agreeToMilestonePlan = useCallback(async (milestones: Parameters<typeof agreeToJobMilestonePlan>[1]) => {
    if (!request) throw new Error("Application details are unavailable.");
    setMilestoneAgreement((current) => current ? { ...current, updating: true, error: undefined } : current);
    try {
      const saved = await agreeToJobMilestonePlan(applicationId, milestones);
      setMilestoneAgreement({ ...saved, currentParty: request.currentParty, updating: false });
      return saved;
    } catch (cause) {
      setMilestoneAgreement((current) => current ? { ...current, updating: false, error: cause instanceof Error ? cause.message : "Unable to record milestone agreement." } : current);
      throw cause;
    }
  }, [applicationId, request]);

  const sendMessage = useCallback(async (
    message: string,
    attachment?: File,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ) => {
    if (!conversationId) return false;
    setSending(true);
    setConversationError("");
    try {
      await sendConversationMessage(conversationId, message, attachment, onProgress, signal);
      await refreshConversationMessages();
      return true;
    } catch (cause) {
      setConversationError(cause instanceof Error ? cause.message : "Unable to send the message.");
      return false;
    } finally {
      setSending(false);
    }
  }, [conversationId, refreshConversationMessages]);

  const openExistingAgreement = useCallback(async (
    proposal: ContractVersionAgreementInput,
    requestId: string,
    contractDocument?: File,
    agreeNow = false,
  ) => {
    if (busy) return false;
    if (!request) throw new Error("The application details are unavailable.");
    const activeRequest = request;
    setBusy(true);
    setError("");
    try {
      if (agreeNow) {
        const existingOrder = await supabase
          .from("service_orders")
          .select("order_id")
          .eq("application_id", applicationId)
          .maybeSingle();
        if (existingOrder.error)
          throw new Error("Unable to verify whether this application already has a saved agreement.");
        if (existingOrder.data)
          throw new Error("A saved agreement already exists. Open the project to review and agree to its current terms.");
      }
      const rpcResult = await platformAction("worksync_job_agreement", { p_application: applicationId });
      if (typeof rpcResult !== "string") throw new Error("Agreement RPC did not return a service order ID.");
      const { data: order, error: orderError } = await supabase
        .from("service_orders")
        .select("order_id, conversation_id")
        .eq("order_id", rpcResult)
        .maybeSingle();
      if (orderError) throw new Error("Unable to verify access to the agreement.");

      let serviceOrderId = order?.order_id;
      if (!serviceOrderId) {
        const { data: contract, error: contractError } = await supabase
          .from("contracts")
          .select("order_id")
          .eq("contract_id", rpcResult)
          .maybeSingle();
        if (contractError) throw new Error("Unable to verify access to the agreement.");
        if (typeof contract?.order_id !== "string") throw new Error("The agreement project could not be found.");
        serviceOrderId = contract.order_id;
      }
      const { data: agreement, error: agreementError } = await supabase
        .from("contracts")
        .select("contract_id,current_version")
        .eq("order_id", serviceOrderId)
        .maybeSingle();
      if (agreementError) throw new Error("Unable to load the agreement version for saving.");
      if (!agreement?.contract_id || !Number.isInteger(agreement.current_version)) {
        throw new Error("The agreement version is unavailable.");
      }
      await saveContractVersionForAgreement({
        ...proposal,
        contractId: agreement.contract_id,
        expectedVersion: agreement.current_version,
        requestId,
      });
      if (contractDocument) {
        let conversationId = typeof order?.conversation_id === "string" ? order.conversation_id : null;
        if (!conversationId) {
          const { data: relatedOrder, error: relatedOrderError } = await supabase
            .from("service_orders")
            .select("conversation_id")
            .eq("order_id", serviceOrderId)
            .maybeSingle();
          if (relatedOrderError) throw new Error("The agreement was created, but its conversation could not be loaded to send the document.");
          conversationId = typeof relatedOrder?.conversation_id === "string" ? relatedOrder.conversation_id : null;
        }
        if (!conversationId) throw new Error("The agreement was created, but no agreement conversation is available for the document.");
        await sendConversationMessage(conversationId, "Attached contract document for review.", contractDocument);
      }
      if (agreeNow) await respondToProjectAgreement(serviceOrderId, true);
      const draftOwnerId = activeRequest.currentParty === "client" ? activeRequest.clientUserId : activeRequest.freelancerUserId;
      void deleteContractCreationDraft(
        `worksync:contract-draft:${draftOwnerId}:${applicationId}`,
        draftOwnerId,
      ).catch((draftError) => console.warn("Saved contract draft could not be cleared:", draftError));
      const projectRoute = activeRequest.projectType === "milestone" ? "milestone" : "standard";
      router.push(`/home/projects/${projectRoute}/${serviceOrderId}?view=agreement#contract`);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open agreement.");
      setBusy(false);
      return false;
    }
  }, [applicationId, busy, request, router]);

  if (loading) return <ContentSkeleton label="Loading contract details" variant="workspace"/>;
  if (!request) return <div role="alert" className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-destructive">{error || "Application not found."}</div>;

  return <>
    {error && <p role="alert" className="mx-auto mt-4 max-w-5xl px-4 text-sm text-destructive">{error}</p>}
    <JobAgreementWizard initial={{
      title: basicAgreement?.terms?.projectTitle ?? request.jobTitle,
      description: basicAgreement?.terms?.description ?? request.jobDescription,
      budget: basicAgreement?.terms?.budget ?? request.proposedPrice ?? request.jobBudget,
      estimatedDays: request.estimatedDays,
      postingSubmittedAt: request.jobPostedAt,
      startDate: basicAgreement?.terms?.startDate ?? null,
      revisions: basicAgreement?.terms?.revisionsCount ?? 0,
      deadline: basicAgreement?.terms?.deadline ?? null,
      plan: request.proposedPlan,
      planSource: request.proposedPlan ? "Submitted application plan" : "No plan selected",
      projectType: request.projectType,
    }} draftKey={`worksync:contract-draft:${request.currentParty === "client" ? request.clientUserId : request.freelancerUserId}:${applicationId}`} draftUserId={request.currentParty === "client" ? request.clientUserId : request.freelancerUserId} busy={busy} conversationError={conversationError} agreementStatus={canCreateAgreement ? {
      currentParty: "client",
      clientAgreed: false,
      freelancerAgreed: false,
      isNew: true,
      hasPastMilestoneDate: false,
      updating: busy,
    } : undefined} basicAgreementStatus={basicAgreement ?? undefined} onAgreeBasics={agreeToBasics} milestoneAgreementStatus={milestoneAgreement ?? undefined} onAgreeMilestonePlan={agreeToMilestonePlan} onAgree={canCreateAgreement ? async (proposal, requestId, file) => proposal && requestId ? openExistingAgreement(proposal, requestId, file, true) : false : undefined} conversation={conversationId ? {
      conversationId,
      messages: conversationMessages,
      sending,
      isOtherParticipantTyping,
      onSend: sendMessage,
      onTypingChange,
    } : undefined} onBack={() => router.push("/home/projects?status=In%20Discussion")} onOpenExistingAgreement={async (proposal, requestId, file) => { await openExistingAgreement(proposal, requestId, file); }}/>
  </>;
}
