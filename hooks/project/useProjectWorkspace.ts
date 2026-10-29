"use client";

import {
  readProjectCache,
  clearProjectReadCache,
} from "@/lib/projectReadCache";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createProjectTypingChannel,
  getProjectConversationMessages,
  getOlderProjectMessages,
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
import { useMessageAccountSettings } from "@/hooks/message/useMessageAccountSettings";
import { traceProjectFlow } from "@/services/project/projectFlowDiagnostics";
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

export function useProjectWorkspace(serviceOrderId: string) {
  const messageSettings = useMessageAccountSettings();
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [updatingAgreement, setUpdatingAgreement] = useState(false);
  const [updatingApprovalKey, setUpdatingApprovalKey] = useState<string | null>(null);
  const [isOtherParticipantTyping, setIsOtherParticipantTyping] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const workspaceRef = useRef(workspace);
  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);
  const activeOrder = useRef(serviceOrderId);
  const loadVersion = useRef(0);
  const inFlightOrders = useRef(new Set<string>());
  const refreshAfterCurrent = useRef(new Set<string>());
  const sendTypingRef = useRef<(isTyping: boolean) => void>(() => undefined);

  const load = useCallback(
    async (showLoading = true, force = true) => {
      if (!serviceOrderId || activeOrder.current !== serviceOrderId) return;
      if (inFlightOrders.current.has(serviceOrderId)) {
        if (force) refreshAfterCurrent.current.add(serviceOrderId);
        return;
      }
      inFlightOrders.current.add(serviceOrderId);
      traceProjectFlow("workspace loader received route ID", {
        routeIdType: "service_order_id",
        routeId: serviceOrderId,
      });
      const request = ++loadVersion.current;

      try {
        if (showLoading) setLoading(true);
        setError(null);
        const freshWorkspace = await readProjectCache(
          `workspace:${serviceOrderId}`,
          () => getProjectWorkspace(serviceOrderId),
          force,
        );
        if (
          activeOrder.current !== serviceOrderId ||
          request !== loadVersion.current
        )
          return;
        setWorkspace((current) =>
          showLoading || !current || current.orderId !== serviceOrderId
            ? freshWorkspace
            : {
                ...freshWorkspace,
                messages: mergeMessages(
                  current.messages,
                  freshWorkspace.messages,
                ),
                hasOlderMessages:
                  current.hasOlderMessages && freshWorkspace.hasOlderMessages,
              },
        );
      } catch (cause) {
        if (
          activeOrder.current !== serviceOrderId ||
          request !== loadVersion.current
        )
          return;
        traceProjectFlow("workspace load failed", {
          routeIdType: "service_order_id",
          routeId: serviceOrderId,
          error:
            cause instanceof Error ? cause.message : "Unknown workspace error",
        });
        setError(
          cause instanceof Error ? cause.message : "Failed to load project.",
        );
        if (showLoading) setWorkspace(null);
      } finally {
        if (
          activeOrder.current === serviceOrderId &&
          request === loadVersion.current
        )
          setLoading(false);
        inFlightOrders.current.delete(serviceOrderId);
        if (refreshAfterCurrent.current.delete(serviceOrderId)) {
          window.setTimeout(() => {
            if (activeOrder.current === serviceOrderId) void load(false, true);
          }, 0);
        }
      }
    },
    [serviceOrderId],
  );

  const refreshProjectMessages = useCallback(async () => {
    const current = workspaceRef.current;
    if (!current?.conversationId) {
      void load(false);
      return;
    }
    const lastMessage = current.messages.at(-1);
    try {
      const fresh = await getProjectConversationMessages(
        current.conversationId,
        current.currentUserId,
        lastMessage
          ? { createdAt: lastMessage.createdAt, messageId: lastMessage.id }
          : undefined,
      );
      if (!fresh.length) return;
      setWorkspace((latest) =>
        latest?.conversationId === current.conversationId
          ? { ...latest, messages: mergeMessages(latest.messages, fresh) }
          : latest,
      );
    } catch (cause) {
      console.warn(
        "Unable to refresh project messages:",
        cause instanceof Error ? cause.message : cause,
      );
    }
  }, [load]);

  const loadOlderMessages = useCallback(async () => {
    const current = workspaceRef.current;
    const firstMessage = current?.messages[0];
    if (!current?.conversationId || !firstMessage || loadingOlderMessages)
      return;
    setLoadingOlderMessages(true);
    try {
      const older = await getOlderProjectMessages(
        current.conversationId,
        current.currentUserId,
        { createdAt: firstMessage.createdAt, messageId: firstMessage.id },
      );
      setWorkspace((latest) =>
        latest?.conversationId === current.conversationId
          ? {
              ...latest,
              messages: mergeMessages(latest.messages, older.messages),
              hasOlderMessages: older.hasOlderMessages,
            }
          : latest,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load older messages.",
      );
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [loadingOlderMessages]);

  useEffect(() => {
    activeOrder.current = serviceOrderId;
    void load(true, false);
    const refresh = () => {
      if (document.visibilityState === "visible") void load(false, false);
    };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const onRoleChanged = () => {
      setWorkspace(null);
      void load(true, true);
    };
    window.addEventListener("account-role-changed", onRoleChanged);
    return () => {
      activeOrder.current = "";
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("account-role-changed", onRoleChanged);
    };
  }, [load, serviceOrderId]);

  useEffect(() => {
    return workspace?.conversationId
      ? subscribeToConversationMessages(
          workspace.conversationId,
          () => void refreshProjectMessages(),
          "INSERT",
        )
      : subscribeToUserConversations(() => void load(false));
  }, [load, refreshProjectMessages, workspace?.conversationId]);

  useEffect(() => {
    if (!workspace?.contractId) return;

    let channel = supabase
      .channel(`project-contract:${workspace.contractId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "service_orders",
          filter: `order_id=eq.${serviceOrderId}`,
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
      );
    if (workspace.type === "milestone") {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contract_item_approvals",
          filter: `contract_id=eq.${workspace.contractId}`,
        },
        () => void load(false),
      );
    }
    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, serviceOrderId, workspace?.contractId, workspace?.type]);

  useEffect(() => {
    if (
      !workspace?.conversationId ||
      !messageSettings.ready ||
      !messageSettings.settings.typingIndicators
    ) {
      sendTypingRef.current = () => undefined;
      return;
    }

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
  }, [
    workspace?.conversationId,
    workspace?.currentUserId,
    messageSettings.ready,
    messageSettings.settings.typingIndicators,
  ]);

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

  const sendMessage = async (
    message: string,
    attachment?: File,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ) => {
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
      current?.orderId === serviceOrderId
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
        serviceOrderId,
        content,
        messageId,
        attachment,
        onProgress,
        signal,
      );
      setWorkspace((current) =>
        current?.orderId === serviceOrderId
          ? {
              ...current,
              conversationId: uploaded.conversationId ?? current.conversationId,
              messages: current.messages.map((item) =>
                item.id === messageId
                  ? {
                      ...item,
                      attachmentUrl: uploaded.attachmentUrl,
                      attachmentType: uploaded.attachmentType,
                    }
                  : item,
              ),
            }
          : current,
      );
      clearProjectReadCache();
      return true;
    } catch (cause) {
      setWorkspace((current) =>
        current?.orderId === serviceOrderId
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

  const respondToAgreement = async (accepted: boolean) => {
    try {
      setUpdatingAgreement(true);
      setError(null);
      await respondToProjectAgreement(serviceOrderId, accepted);
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

  const respondToAgreementItem = async (itemKey: string, approved: boolean) => {
    try {
      setUpdatingApprovalKey(itemKey);
      await respondToProjectAgreementItem(serviceOrderId, itemKey, approved);
      clearProjectReadCache();
      await load(false);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update agreement.");
      return false;
    } finally {
      setUpdatingApprovalKey(null);
    }
  };

  const saveAgreementItem = async (itemKey: "budget" | "delivery" | "revisions", value: number) => {
    try {
      setUpdatingApprovalKey(itemKey);
      await updateProjectAgreementItem(serviceOrderId, itemKey, value);
      clearProjectReadCache();
      await load(false);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update agreement.");
      return false;
    } finally {
      setUpdatingApprovalKey(null);
    }
  };

  const saveAgreementTerms = async (budget: number, deliveryDays: number) => {
    try {
      setUpdatingAgreement(true);
      setError(null);
      await updateProjectAgreementTerms(serviceOrderId, budget, deliveryDays);
      clearProjectReadCache();
      await load(false);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update agreement.");
      return false;
    } finally {
      setUpdatingAgreement(false);
    }
  };

  return {
    workspace: workspace?.orderId === serviceOrderId ? workspace : null,
    loading: loading || (!!workspace && workspace.orderId !== serviceOrderId),
    sending,
    loadingOlderMessages,
    updatingAgreement,
    updatingApprovalKey,
    isOtherParticipantTyping,
    error,
    refresh: () => {
      clearProjectReadCache();
      return load(false);
    },
    sendMessage,
    loadOlderMessages,
    sendTyping,
    respondToAgreement,
    respondToAgreementItem,
    saveAgreementItem,
    saveAgreementTerms,
  };
}
