"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { JobAgreementWizard } from "@/components/project/JobAgreementWizard";
import { supabase } from "@/lib/supabaseClient";
import { platformAction } from "@/services/platform/platformService";
import { getProjectRequests, type ProjectRequest } from "@/services/project/projectRequestService";
import { sendConversationMessage } from "@/services/message/messageService";
import { deleteContractCreationDraft } from "@/services/project/contractCreationDraftService";
import {
  saveContractVersionForAgreement,
  type ContractVersionAgreementInput,
} from "@/services/project/projectWorkspaceService";

export default function CreateContractPage() {
  const params = useParams<{ applicationId: string }>();
  const applicationId = params.applicationId;
  const router = useRouter();
  const [request, setRequest] = useState<ProjectRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setLoading(true);
    void getProjectRequests()
      .then((data) => {
        const found = [...data.discussions, ...data.received, ...data.sent]
          .find((item) => item.applicationId === applicationId);
        if (!found) throw new Error("This application is unavailable or is no longer accessible.");
        if (current) setRequest(found);
      })
      .catch((cause) => {
        if (current) setError(cause instanceof Error ? cause.message : "Unable to load this application.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [applicationId]);

  const openExistingAgreement = useCallback(async (
    proposal: ContractVersionAgreementInput,
    requestId: string,
    contractDocument?: File,
  ) => {
    if (busy) return;
    if (!request) throw new Error("The application details are unavailable.");
    const activeRequest = request;
    setBusy(true);
    setError("");
    try {
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
      const draftOwnerId = activeRequest.currentParty === "client" ? activeRequest.clientUserId : activeRequest.freelancerUserId;
      void deleteContractCreationDraft(
        `worksync:contract-draft:${draftOwnerId}:${applicationId}`,
        draftOwnerId,
      ).catch((draftError) => console.warn("Saved contract draft could not be cleared:", draftError));
      router.push(`/home/projects/standard/${serviceOrderId}?view=agreement#contract`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open agreement.");
      setBusy(false);
    }
  }, [applicationId, busy, request, router]);

  if (loading) return <ContentSkeleton label="Loading contract details" variant="workspace"/>;
  if (!request) return <div role="alert" className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-destructive">{error || "Application not found."}</div>;

  return <>
    {error && <p role="alert" className="mx-auto mt-4 max-w-5xl px-4 text-sm text-destructive">{error}</p>}
    <JobAgreementWizard initial={{
      title: request.jobTitle,
      description: request.jobDescription,
      budget: request.proposedPrice ?? request.jobBudget,
      estimatedDays: request.estimatedDays,
      postingSubmittedAt: request.jobPostedAt,
      startDate: null,
      revisions: 0,
      deadline: null,
      plan: request.proposedPlan,
      planSource: request.proposedPlan ? "Submitted application plan" : "No plan selected",
    }} draftKey={`worksync:contract-draft:${request.currentParty === "client" ? request.clientUserId : request.freelancerUserId}:${applicationId}`} draftUserId={request.currentParty === "client" ? request.clientUserId : request.freelancerUserId} busy={busy} onBack={() => router.push("/home/projects?status=In%20Discussion")} onOpenExistingAgreement={(proposal, requestId, file) => openExistingAgreement(proposal, requestId, file)}/>
  </>;
}
