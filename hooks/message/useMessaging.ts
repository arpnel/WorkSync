"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  getMessagingPreferences,
  isMessagingSetupMissing,
  saveConversationPreference,
  setUserBlocked,
  getConversationMessages,
  getMessageConversations,
  markConversationRead,
  sendConversationMessage,
  subscribeToConversationMessages,
  subscribeToUserConversations,
} from "@/services/message/messageService";
import type { ChatMessage, MessageConversation } from "@/types/message/message";

export function useMessaging() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<MessageConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [messageState, setMessageState] = useState<{
    conversationId: string | null;
    messages: ChatMessage[];
  }>({ conversationId: null, messages: [] });
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messageRequest = useRef(0);
  const [sending, setSending] = useState(false);
  const [preferences, setPreferences] = useState<
    import("@/types/message/message").MessagingPreferences
  >({ preferences: [], blockedUserIds: [], blockedByUserIds: [] });
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const selectedRef = useRef(selectedConversationId);
  const selectConversation = useCallback((conversationId: string | null) => {
    if (selectedRef.current === conversationId) return;
    // Invalidate immediately, before effects or late realtime callbacks run.
    selectedRef.current = conversationId;
    messageRequest.current += 1;
    setSelectedConversationId(conversationId);
  }, []);
  const sendingRef = useRef(false);
  const preferenceSavingRef = useRef(false);
  const missingPreferencesSetup = useRef(false);
  const preferencesLoading = useRef(false);
  const loadPreferences = useCallback(async (retrySetup = false) => {
    if (
      preferencesLoading.current ||
      (missingPreferencesSetup.current && !retrySetup)
    )
      return;
    preferencesLoading.current = true;
    try {
      setPreferences(await getMessagingPreferences());
      missingPreferencesSetup.current = false;
      setPreferencesReady(true);
    } catch (error) {
      missingPreferencesSetup.current = isMessagingSetupMissing(error);
      setPreferencesReady(false);
    } finally {
      preferencesLoading.current = false;
    }
  }, []);
  useEffect(() => {
    void loadPreferences();
    const refresh = () => {
      if (document.visibilityState === "visible") void loadPreferences();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadPreferences]);

  const updatePreference = async (
    conversationId: string,
    patch: Partial<{ is_archived: boolean; is_pinned: boolean }>,
  ) => {
    if (!preferencesReady || preferenceSavingRef.current) return;
    preferenceSavingRef.current = true;
    setSavingPreference(true);
    const existing = preferences.preferences.find(
      (p) => p.conversation_id === conversationId,
    );
    const next = {
      is_archived: existing?.is_archived ?? false,
      is_pinned: existing?.is_pinned ?? false,
      ...patch,
    };
    try {
      await saveConversationPreference(conversationId, next);
      setPreferences((current) => ({
        ...current,
        preferences: [
          ...current.preferences.filter(
            (p) => p.conversation_id !== conversationId,
          ),
          { conversation_id: conversationId, ...next },
        ],
      }));
    } catch {
      toast.error("Unable to save this chat preference. Please try again.");
    } finally {
      preferenceSavingRef.current = false;
      setSavingPreference(false);
    }
  };
  const blockUser = async (userId: string, blocked: boolean) => {
    if (!preferencesReady || preferenceSavingRef.current) return;
    preferenceSavingRef.current = true;
    setSavingPreference(true);
    try {
      await setUserBlocked(userId, blocked);
      setPreferences((current) => ({
        ...current,
        blockedUserIds: blocked
          ? [...new Set([...current.blockedUserIds, userId])]
          : current.blockedUserIds.filter((id) => id !== userId),
      }));
      toast.success(blocked ? "User blocked." : "User unblocked.");
    } catch {
      toast.error("Unable to change blocking. Please try again.");
    } finally {
      preferenceSavingRef.current = false;
      setSavingPreference(false);
    }
  };
  const [error, setError] = useState<string | null>(null);

  const conversationRequest = useRef(0);
  const loadConversations = useCallback(async () => {
    const request = ++conversationRequest.current;
    try {
      const result = await getMessageConversations();
      if (request !== conversationRequest.current) return;
      setCurrentUserId(result.currentUserId);
      setConversations(result.conversations);
      setError(null);

      if (
        selectedRef.current &&
        !result.conversations.some(
          (c) => c.conversationId === selectedRef.current,
        )
      ) {
        selectConversation(null);
      }
    } catch (loadError) {
      if (request !== conversationRequest.current) return;
      console.error("Failed to load conversations:", loadError);
      setError("Unable to load your conversations.");
    } finally {
      if (request === conversationRequest.current)
        setLoadingConversations(false);
    }
  }, [selectConversation]);

  const loadMessages = useCallback(
    async (conversationId: string, background = false) => {
      if (selectedRef.current !== conversationId) return;
      const request = ++messageRequest.current;
      const isCurrent = () =>
        request === messageRequest.current &&
        selectedRef.current === conversationId;
      if (!background) {
        setMessageState({ conversationId, messages: [] });
        setLoadingMessages(true);
      }

      try {
        const data = await getConversationMessages(conversationId);
        if (!isCurrent()) return;
        setMessageState({
          conversationId,
          messages: [
            ...new Map(
              data
                .filter((message) => message.conversationId === conversationId)
                .map((message) => [message.messageId, message]),
            ).values(),
          ],
        });
        setLoadingMessages(false);
        await markConversationRead(conversationId);
        if (!isCurrent()) return;
        setConversations((current) =>
          current.map((conversation) =>
            conversation.conversationId === conversationId
              ? { ...conversation, unreadCount: 0 }
              : conversation,
          ),
        );
        if (isCurrent()) setError(null);
      } catch (loadError) {
        if (!isCurrent()) return;
        console.error("Failed to load messages:", loadError);
        setError("Unable to load messages for this conversation.");
      } finally {
        if (isCurrent()) setLoadingMessages(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadConversations();
    const unsubscribe = subscribeToUserConversations(() => {
      void loadConversations();
    });
    return () => {
      conversationRequest.current += 1;
      unsubscribe();
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessageState({ conversationId: null, messages: [] });
      setLoadingMessages(false);
      return;
    }

    void loadMessages(selectedConversationId);

    const unsubscribe = subscribeToConversationMessages(
      selectedConversationId,
      () => {
        void loadMessages(selectedConversationId, true);
        void loadConversations();
      },
    );
    return () => {
      messageRequest.current += 1;
      unsubscribe();
    };
  }, [loadConversations, loadMessages, selectedConversationId]);

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (conversation) =>
          conversation.conversationId === selectedConversationId,
      ) ?? null,
    [conversations, selectedConversationId],
  );

  const sendMessage = useCallback(
    async (message: string, attachment?: File): Promise<boolean> => {
      if (!selectedConversationId || sendingRef.current) {
        return false;
      }

      sendingRef.current = true;
      setSending(true);

      try {
        await sendConversationMessage(
          selectedConversationId,
          message,
          attachment,
        );
        await Promise.all([
          selectedRef.current === selectedConversationId
            ? loadMessages(selectedConversationId, true)
            : Promise.resolve(),
          loadConversations(),
        ]);
        return true;
      } catch (sendError) {
        console.error("Failed to send message:", sendError);
        toast.error(
          sendError instanceof Error
            ? sendError.message
            : "Message could not be sent.",
        );
        return false;
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [loadConversations, loadMessages, selectedConversationId],
  );

  return {
    preferences,
    preferencesReady,
    savingPreference,
    updatePreference,
    blockUser,
    currentUserId,
    conversations,
    selectedConversation,
    selectedConversationId,
    setSelectedConversationId: selectConversation,
    messages:
      messageState.conversationId === selectedConversationId
        ? messageState.messages
        : [],
    loadingConversations,
    loadingMessages:
      Boolean(selectedConversationId) &&
      (loadingMessages ||
        messageState.conversationId !== selectedConversationId),
    sending,
    error,
    reload: async () => {
      await Promise.all([
        loadConversations(),
        loadPreferences(true),
        selectedConversationId
          ? loadMessages(selectedConversationId, true)
          : Promise.resolve(),
      ]);
    },
    sendMessage,
  };
}
