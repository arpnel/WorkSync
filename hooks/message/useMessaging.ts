"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const result = await getMessageConversations();
      setCurrentUserId(result.currentUserId);
      setConversations(result.conversations);
      setError(null);

      setSelectedConversationId((current) => {
        if (
          current &&
          result.conversations.some(
            (conversation) => conversation.conversationId === current,
          )
        ) {
          return current;
        }

        return result.conversations[0]?.conversationId ?? null;
      });
    } catch (loadError) {
      console.error("Failed to load conversations:", loadError);
      setError("Unable to load your conversations.");
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);

    try {
      const data = await getConversationMessages(conversationId);
      setMessages(data);
      await markConversationRead(conversationId);
      setError(null);
    } catch (loadError) {
      console.error("Failed to load messages:", loadError);
      setError("Unable to load messages for this conversation.");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    return subscribeToUserConversations(() => {
      void loadConversations();
    });
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    void loadMessages(selectedConversationId);

    return subscribeToConversationMessages(selectedConversationId, () => {
      void loadMessages(selectedConversationId);
      void loadConversations();
    });
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
    async (message: string) => {
      if (!selectedConversationId || sending) {
        return;
      }

      setSending(true);

      try {
        await sendConversationMessage(selectedConversationId, message);
        await Promise.all([
          loadMessages(selectedConversationId),
          loadConversations(),
        ]);
      } catch (sendError) {
        console.error("Failed to send message:", sendError);
        toast.error("Message could not be sent.");
      } finally {
        setSending(false);
      }
    },
    [loadConversations, loadMessages, selectedConversationId, sending],
  );

  return {
    currentUserId,
    conversations,
    selectedConversation,
    selectedConversationId,
    setSelectedConversationId,
    messages,
    loadingConversations,
    loadingMessages,
    sending,
    error,
    reload: loadConversations,
    sendMessage,
  };
}
