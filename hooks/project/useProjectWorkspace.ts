"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createProjectTypingChannel,
  getProjectWorkspace,
  respondToProjectAgreement,
  respondToProjectAgreementItem,
  sendProjectMessage,
  updateProjectAgreementTerms,
} from "@/services/project/projectWorkspaceService";
import {
  subscribeToConversationMessages,
  subscribeToUserConversations,
} from "@/services/message/messageService";
import { supabase } from "@/lib/supabaseClient";
import type {
  ProjectWorkspace,
  WorkspaceMessage,
} from "@/types/project/projectWorkspace";

function mergeMessages(
  current: WorkspaceMessage[],
  fresh: WorkspaceMessage[],
): WorkspaceMessage[] {
  const messages = new Map(current.map((message) => [message.id, message]));
  fresh.forEach((message) => messages.set(message.id, message));

  return Array.from(messages.values()).sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

export function useProjectWorkspace(orderId: string) {
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [updatingAgreement, setUpdatingAgreement] = useState(false);
  const [updatingApprovalKey, setUpdatingApprovalKey] = useState<string | null>(
    null,
  );
  const [isOtherParticipantTyping, setIsOtherParticipantTyping] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendTypingRef = useRef<(isTyping: boolean) => void>(() => undefined);

  const load = useCallback(
    async (showLoading = true) => {
      if (!orderId) return;

      try {
        if (showLoading) setLoading(true);
        setError(null);
        const freshWorkspace = await getProjectWorkspace(orderId);
        setWorkspace((current) =>
          showLoading || !current
            ? freshWorkspace
            : {
                ...freshWorkspace,
                messages: mergeMessages(
                  current.messages,
                  freshWorkspace.messages,
                ),
              },
        );
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Failed to load project.",
        );
        if (showLoading) setWorkspace(null);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [orderId],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    const refreshMessages = () => {
      void load(false);
    };

    return workspace?.conversationId
      ? subscribeToConversationMessages(
          workspace.conversationId,
          refreshMessages,
        )
      : subscribeToUserConversations(refreshMessages);
  }, [load, workspace?.conversationId]);

  useEffect(() => {
    if (!workspace?.contractId) return;

    const channel = supabase
      .channel(`project-contract:${workspace.contractId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "contracts",
          filter: `contract_id=eq.${workspace.contractId}`,
        },
        () => void load(false),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contract_item_approvals",
          filter: `contract_id=eq.${workspace.contractId}`,
        },
        () => void load(false),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, workspace?.contractId]);

  useEffect(() => {
    if (!workspace?.conversationId) return;

    const typing = createProjectTypingChannel(
      workspace.conversationId,
      workspace.currentUserId,
      setIsOtherParticipantTyping,
    );
    sendTypingRef.current = typing.sendTyping;

    return () => {
      sendTypingRef.current = () => undefined;
      setIsOtherParticipantTyping(false);
      void supabase.removeChannel(typing.channel);
    };
  }, [workspace?.conversationId, workspace?.currentUserId]);

  const sendTyping = useCallback(
    (isTyping: boolean) => sendTypingRef.current(isTyping),
    [],
  );

  const sendMessage = async (message: string, attachment?: File) => {
    const content = message.trim();
    if ((!content && !attachment) || !workspace) return false;

    const messageId = crypto.randomUUID();
    const optimisticMessage: WorkspaceMessage = {
      id: messageId,
      senderId: workspace.currentUserId,
      senderName: "You",
      senderAvatarUrl: null,
      message: content || attachment?.name || "Attachment",
      attachmentUrl: null,
      attachmentType: attachment?.type || null,
      createdAt: new Date().toISOString(),
      mine: true,
    };

    setWorkspace((current) =>
      current
        ? {
            ...current,
            messages: mergeMessages(current.messages, [optimisticMessage]),
          }
        : current,
    );

    try {
      setSending(true);
      setError(null);
      sendTypingRef.current(false);
      const uploaded = await sendProjectMessage(
        orderId,
        content,
        messageId,
        attachment,
      );
      setWorkspace((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((item) =>
                item.id === messageId ? { ...item, ...uploaded } : item,
              ),
            }
          : current,
      );
      await load(false);
      return true;
    } catch (cause) {
      setWorkspace((current) =>
        current
          ? {
              ...current,
              messages: current.messages.filter(
                (item) => item.id !== messageId,
              ),
            }
          : current,
      );
      setError(
        cause instanceof Error ? cause.message : "Failed to send message.",
      );
      return false;
    } finally {
      setSending(false);
    }
  };

  const respondToAgreementItem = async (itemKey: string, approved: boolean) => {
    try {
      setUpdatingApprovalKey(itemKey);
      await respondToProjectAgreementItem(orderId, itemKey, approved);
      await load(false);
      return true;
    } catch (cause) {
      console.error("Failed to update item approval:", cause);
      return false;
    } finally {
      setUpdatingApprovalKey(null);
    }
  };

  const respondToAgreement = async (accepted: boolean) => {
    try {
      setUpdatingAgreement(true);
      setError(null);
      await respondToProjectAgreement(orderId, accepted);
      await load(false);
      return true;
    } catch (cause) {
      console.error("Failed to update agreement:", cause);
      return false;
    } finally {
      setUpdatingAgreement(false);
    }
  };

  const saveAgreementTerms = async (budget: number, deliveryDays: number) => {
    try {
      setUpdatingAgreement(true);
      setError(null);
      await updateProjectAgreementTerms(orderId, budget, deliveryDays);
      await load(false);
      return true;
    } catch (cause) {
      console.error("Failed to update agreement terms:", cause);
      return false;
    } finally {
      setUpdatingAgreement(false);
    }
  };

  return {
    workspace,
    loading,
    sending,
    updatingAgreement,
    updatingApprovalKey,
    isOtherParticipantTyping,
    error,
    refresh: () => load(false),
    sendMessage,
    sendTyping,
    respondToAgreement,
    respondToAgreementItem,
    saveAgreementTerms,
  };
}
