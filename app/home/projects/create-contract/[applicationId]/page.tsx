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
  activateConfirmedProjectAgreement,
  getProjectConversationMessages,
  respondToProjectAgreement,
  type ContractVersionAgreementInput,
  type ContractVersionMilestoneInput,
} from "@/services/project/projectWorkspaceService";
import { getSubscriptionLimitMessage, openSubscriptionLimitDialog } from "@/services/subscriptions/subscriptionLimitDialog";
import type { WorkspaceMessage } from "@/types/project/projectWorkspace";

type FinalContractAgreementStatus = {
  currentParty: "client" | "freelancer";
  clientAgreed: boolean;
  freelancerAgreed: boolean;
  isNew: boolean;
  hasPastMilestoneDate: boolean;
  updating: boolean;
};

function restoreMilestoneTaskIds(
  milestones: readonly ContractVersionMilestoneInput[],
  plan: ProjectRequest["proposedPlan"],
): ContractVersionMilestoneInput[] {
  if (!plan) return milestones.map((milestone) => ({ ...milestone }));
  const tasks = plan.content.columns
    .filter((column) => column.type === "stage")
    .flatMap((column) => column.tasks.map((task) => ({
      id: `${column.id}:${task.id}`,
      title: task.title,
      description: task.description,
    })));

  return milestones.map((milestone) => {
    if (milestone.taskIds?.length) return { ...milestone, taskIds: [...milestone.taskIds] };
    const matches = tasks.filter((task) =>
      task.title === milestone.title &&
      (!milestone.description || task.description === milestone.description),
    );
    return matches.length === 1
      ? { ...milestone, taskIds: [matches[0].id] }
      : { ...milestone, taskIds: [] };
  });
}

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
  const [agreementOrderId, setAgreementOrderId] = useState<string | null>(null);
  const [finalContractStatus, setFinalContractStatus] = useState<FinalContractAgreementStatus | null>(null);
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
  const agreementUpdateChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);

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
    setAgreementOrderId(null);
    setFinalContractStatus(null);
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
              previousTerms: null,
              changedFields: [],
              changedBy: null,
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
            if (current) setMilestoneAgreement({ ...savedPlan, milestones: restoreMilestoneTaskIds(savedPlan.milestones, found.proposedPlan), currentParty: found.currentParty, updating: false });
          } catch (cause) {
            if (current) setMilestoneAgreement({ milestones: [], previousMilestones: [], changedBy: null, clientAgreed: false, freelancerAgreed: false, currentParty: found.currentParty, updating: false, error: cause instanceof Error ? cause.message : "Milestone agreement could not be loaded." });
          }
        }
        const existingOrder = await supabase
          .from("service_orders")
          .select("order_id")
          .eq("application_id", applicationId)
          .maybeSingle();
        const canCreate = !existingOrder.error && !existingOrder.data && found.currentParty === "client";
        if (current) {
          setCanCreateAgreement(canCreate);
          if (existingOrder.data?.order_id) {
            setAgreementOrderId(existingOrder.data.order_id);
            const { data: contract, error: contractStatusError } = await supabase
              .from("contracts")
              .select("current_version,client_signed_version,freelancer_signed_version")
              .eq("order_id", existingOrder.data.order_id)
              .maybeSingle();
            if (!contractStatusError && contract) {
              const clientAgreed = contract.client_signed_version === contract.current_version;
              const freelancerAgreed = contract.freelancer_signed_version === contract.current_version;
              setFinalContractStatus({
                currentParty: found.currentParty,
                clientAgreed,
                freelancerAgreed,
                isNew: false,
                hasPastMilestoneDate: false,
                updating: false,
              });
              if (clientAgreed && freelancerAgreed) {
                try {
                  await activateConfirmedProjectAgreement(existingOrder.data.order_id);
                } catch (cause) {
                  if (current && !openSubscriptionLimitDialog(cause))
                    setError(`Both parties agreed, but project activation failed: ${cause instanceof Error ? cause.message : "Unknown activation error."}`);
                }
              }
            }
          } else if (canCreate) {
            setFinalContractStatus({
              currentParty: found.currentParty,
              clientAgreed: false,
              freelancerAgreed: false,
              isNew: true,
              hasPastMilestoneDate: false,
              updating: false,
            });
          }
        }
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

  const refreshAgreementState = useCallback(async () => {
    if (!request) return;
    try {
      const saved = await getJobBasicTermsAgreement(applicationId);
      setBasicAgreement({ ...saved, currentParty: request.currentParty, updating: false });
    } catch (cause) {
      setBasicAgreement((current) => current ? {
        ...current,
        error: cause instanceof Error ? cause.message : "Basic terms agreement could not be refreshed.",
      } : current);
    }
    if (request.projectType === "milestone") {
      try {
        const saved = await getJobMilestonePlanAgreement(applicationId);
        setMilestoneAgreement({ ...saved, milestones: restoreMilestoneTaskIds(saved.milestones, request.proposedPlan), currentParty: request.currentParty, updating: false });
      } catch (cause) {
        setMilestoneAgreement((current) => current ? {
          ...current,
          error: cause instanceof Error ? cause.message : "Milestone agreement could not be refreshed.",
        } : current);
      }
    }
  }, [applicationId, request]);

  useEffect(() => {
    if (!request) return;
    const channel = supabase
      .channel(`job-agreement-updates:${applicationId}`)
      .on("broadcast", { event: "agreement-updated" }, () => {
        void refreshAgreementState();
      })
      .subscribe();
    agreementUpdateChannel.current = channel;
    return () => {
      if (agreementUpdateChannel.current === channel) agreementUpdateChannel.current = null;
      void supabase.removeChannel(channel);
    };
  }, [applicationId, refreshAgreementState, request]);

  const broadcastAgreementUpdate = useCallback((kind: "basic-terms" | "milestone-plan") => {
    void agreementUpdateChannel.current?.send({
      type: "broadcast",
      event: "agreement-updated",
      payload: { kind },
    });
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
      broadcastAgreementUpdate("basic-terms");
      return saved;
    } catch (cause) {
      setBasicAgreement((current) => current ? { ...current, updating: false } : current);
      throw cause;
    }
  }, [applicationId, broadcastAgreementUpdate, request]);

  const agreeToMilestonePlan = useCallback(async (milestones: Parameters<typeof agreeToJobMilestonePlan>[1]) => {
    if (!request) throw new Error("Application details are unavailable.");
    setMilestoneAgreement((current) => current ? { ...current, updating: true, error: undefined } : current);
    try {
      const saved = await agreeToJobMilestonePlan(applicationId, milestones);
      const savedWithTaskIds = {
        ...saved,
        milestones: saved.milestones.map((milestone) => {
          const submitted = milestones.find((item) => item.id === milestone.id);
          return {
            ...milestone,
            taskIds: submitted?.taskIds?.length
              ? [...submitted.taskIds]
              : milestone.taskIds ?? [],
          };
        }),
      };
      setMilestoneAgreement({ ...savedWithTaskIds, currentParty: request.currentParty, updating: false });
      broadcastAgreementUpdate("milestone-plan");
      return savedWithTaskIds;
    } catch (cause) {
      setMilestoneAgreement((current) => current ? { ...current, updating: false, error: cause instanceof Error ? cause.message : "Unable to record milestone agreement." } : current);
      throw cause;
    }
  }, [applicationId, broadcastAgreementUpdate, request]);

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
      let serviceOrderId = rpcResult;
      const agreementByOrder = await supabase
        .from("contracts")
        .select("contract_id, order_id, current_version")
        .eq("order_id", serviceOrderId)
        .maybeSingle();
      if (agreementByOrder.error) throw new Error(`Unable to load the agreement version for saving: ${agreementByOrder.error.message}`);
      let agreement = agreementByOrder.data;
      if (!agreement) {
        const { data: contractById, error: contractError } = await supabase
          .from("contracts")
          .select("contract_id, order_id, current_version")
          .eq("contract_id", rpcResult)
          .maybeSingle();
        if (contractError) throw new Error(`Unable to load the agreement version for saving: ${contractError.message}`);
        if (typeof contractById?.order_id !== "string") throw new Error("The agreement project could not be found.");
        agreement = contractById;
        serviceOrderId = contractById.order_id;
      }
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
        let agreementConversationId = conversationId;
        if (!agreementConversationId) {
          const { data: relatedOrder, error: relatedOrderError } = await supabase
            .from("service_orders")
            .select("conversation_id")
            .eq("order_id", serviceOrderId)
            .maybeSingle();
          if (relatedOrderError) throw new Error("The agreement was created, but its conversation could not be loaded to send the document.");
          agreementConversationId = typeof relatedOrder?.conversation_id === "string" ? relatedOrder.conversation_id : null;
        }
        if (!agreementConversationId) throw new Error("The agreement was created, but no agreement conversation is available for the document.");
        await sendConversationMessage(agreementConversationId, "Attached contract document for review.", contractDocument);
      }
      if (agreeNow) await respondToProjectAgreement(serviceOrderId, true);
      const draftOwnerId = activeRequest.currentParty === "client" ? activeRequest.clientUserId : activeRequest.freelancerUserId;
      void deleteContractCreationDraft(
        `worksync:contract-draft:${draftOwnerId}:${applicationId}`,
        draftOwnerId,
      ).catch((draftError) => console.warn("Saved contract draft could not be cleared:", draftError));
      if (agreeNow) {
        setAgreementOrderId(serviceOrderId);
        setFinalContractStatus({
          currentParty: activeRequest.currentParty,
          clientAgreed: activeRequest.currentParty === "client",
          freelancerAgreed: activeRequest.currentParty === "freelancer",
          isNew: false,
          hasPastMilestoneDate: false,
          updating: false,
        });
        setCanCreateAgreement(false);
        setBusy(false);
        return true;
      }
      const projectRoute = activeRequest.projectType === "milestone" ? "milestone" : "standard";
      router.push(`/home/projects/${projectRoute}/${serviceOrderId}?view=agreement#contract`);
      return true;
    } catch (cause) {
      if (getSubscriptionLimitMessage(cause)) {
        setBusy(false);
        throw cause;
      }
      if (!openSubscriptionLimitDialog(cause))
        setError(cause instanceof Error ? cause.message : "Unable to open agreement.");
      setBusy(false);
      return false;
    }
  }, [applicationId, busy, conversationId, request, router]);

  const confirmExistingContract = useCallback(async () => {
    if (!request || !agreementOrderId || !finalContractStatus || finalContractStatus.isNew) return false;
    setBusy(true);
    setFinalContractStatus((current) => current ? { ...current, updating: true } : current);
    try {
      await respondToProjectAgreement(agreementOrderId, true);
      setFinalContractStatus((current) => current ? {
        ...current,
        clientAgreed: current.clientAgreed || request.currentParty === "client",
        freelancerAgreed: current.freelancerAgreed || request.currentParty === "freelancer",
        updating: false,
      } : current);
      setBusy(false);
      return true;
    } catch (cause) {
      setFinalContractStatus((current) => current ? { ...current, updating: false } : current);
      setBusy(false);
      throw cause;
    }
  }, [agreementOrderId, finalContractStatus, request]);

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
    }} clientName={request.clientName} freelancerName={request.freelancerName} draftKey={`worksync:contract-draft:${request.currentParty === "client" ? request.clientUserId : request.freelancerUserId}:${applicationId}`} draftUserId={request.currentParty === "client" ? request.clientUserId : request.freelancerUserId} busy={busy} conversationError={conversationError} agreementStatus={finalContractStatus ?? (canCreateAgreement ? {
      currentParty: request.currentParty,
      clientAgreed: false,
      freelancerAgreed: false,
      isNew: true,
      hasPastMilestoneDate: false,
      updating: busy,
    } : undefined)} basicAgreementStatus={basicAgreement ?? undefined} onAgreeBasics={agreeToBasics} milestoneAgreementStatus={milestoneAgreement ?? undefined} onAgreeMilestonePlan={agreeToMilestonePlan} onAgree={finalContractStatus?.isNew === false && agreementOrderId ? confirmExistingContract : canCreateAgreement ? async (proposal, requestId, file) => proposal && requestId ? openExistingAgreement(proposal, requestId, file, true) : false : undefined} conversation={conversationId ? {
      conversationId,
      messages: conversationMessages,
      sending,
      isOtherParticipantTyping,
      onSend: sendMessage,
      onTypingChange,
    } : undefined} onBack={() => router.push("/home/projects?status=In%20Discussion")} onOpenExistingAgreement={async (proposal, requestId, file) => { await openExistingAgreement(proposal, requestId, file); }}/>
  </>;
}
