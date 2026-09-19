"use client";

import {
  readProjectCache,
  clearProjectReadCache,
} from "@/lib/projectReadCache";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createProjectTypingChannel,
  getProjectWorkspace,
  respondToProjectAgreement,
  respondToProjectAgreementItem,
  sendProjectMessage,
  updateProjectAgreementItem,
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
  const activeOrder = useRef(orderId);
  const loadVersion = useRef(0);
  const sendTypingRef = useRef<(isTyping: boolean) => void>(() => undefined);

  const load = useCallback(
    async (showLoading = true, force = true) => {
      if (!orderId || activeOrder.current !== orderId) return;
      const request = ++loadVersion.current;

      try {
        if (showLoading) setLoading(true);
        setError(null);
        const freshWorkspace = await readProjectCache(
          `workspace:${orderId}`,
          () => getProjectWorkspace(orderId),
          force,
        );
        if (activeOrder.current !== orderId || request !== loadVersion.current)
          return;
        setWorkspace((current) =>
          showLoading || !current || current.orderId !== orderId
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
        if (activeOrder.current !== orderId || request !== loadVersion.current)
          return;
        setError(
          cause instanceof Error ? cause.message : "Failed to load project.",
        );
        if (showLoading) setWorkspace(null);
      } finally {
        if (activeOrder.current === orderId && request === loadVersion.current)
          setLoading(false);
      }
    },
    [orderId],
  );

  useEffect(() => {
    activeOrder.current = orderId;
    void load(true, false);
    const refresh = () => {
      if (document.visibilityState === "visible") void load(false, false);
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      activeOrder.current = "";
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load, orderId]);

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
          table: "service_orders",
          filter: `order_id=eq.${orderId}`,
        },
        () => void load(false),
      )
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
  }, [load, orderId, workspace?.contractId]);

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

  useEffect(() => {
    if (!workspace?.projectId) return;
    const channel = supabase
      .channel("workspace-state:" + workspace.projectId)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "projects",
          filter: "project_id=eq." + workspace.projectId,
        },
        () => void load(false),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "milestones",
          filter: "project_id=eq." + workspace.projectId,
        },
        () => void load(false),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, workspace?.projectId]);

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
      current?.orderId === orderId
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
        current?.orderId === orderId
          ? {
              ...current,
              messages: current.messages.map((item) =>
                item.id === messageId ? { ...item, ...uploaded } : item,
              ),
            }
          : current,
      );
      clearProjectReadCache();
      await load(false);
      return true;
    } catch (cause) {
      setWorkspace((current) =>
        current?.orderId === orderId
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
      clearProjectReadCache();
      await load(false);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update agreement.",
      );
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
      clearProjectReadCache();
      await load(false);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update agreement.",
      );
      return false;
    } finally {
      setUpdatingAgreement(false);
    }
  };

  const saveAgreementItem = async (
    itemKey: "budget" | "delivery" | "revisions",
    value: number,
  ) => {
    try {
      setUpdatingApprovalKey(itemKey);
      await updateProjectAgreementItem(orderId, itemKey, value);
      clearProjectReadCache();
      await load(false);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update agreement.",
      );
      return false;
    } finally {
      setUpdatingApprovalKey(null);
    }
  };

  const saveAgreementTerms = async (budget: number, deliveryDays: number) => {
    try {
      setUpdatingAgreement(true);
      setError(null);
      await updateProjectAgreementTerms(orderId, budget, deliveryDays);
      clearProjectReadCache();
      await load(false);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update agreement.",
      );
      return false;
    } finally {
      setUpdatingAgreement(false);
    }
  };

  return {
    workspace: workspace?.orderId === orderId ? workspace : null,
    loading: loading || (!!workspace && workspace.orderId !== orderId),
    sending,
    updatingAgreement,
    updatingApprovalKey,
    isOtherParticipantTyping,
    error,
    refresh: () => {
      clearProjectReadCache();
      return load(false);
    },
    sendMessage,
    sendTyping,
    respondToAgreement,
    respondToAgreementItem,
    saveAgreementItem,
    saveAgreementTerms,
  };
}
