"use client";

import ChatHeader from "../../../components/message/ChatHeader";
import ChatLayout from "../../../components/message/ChatLayout";
import ConversationSidebar from "../../../components/message/ConversationSidebar";
import EmptyChat from "../../../components/message/EmptyChat";
import LoadingChat from "../../../components/message/LoadingChat";
import MessageInput from "../../../components/message/MessageInput";
import MessageScroller from "../../../components/message/MessageScroller";

import { Button } from "@/components/ui/button";
import { useMessaging } from "@/hooks/message/useMessaging";

function formatConversationTime(value: string) {
  const date = new Date(value);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("en-PH", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function MessagesPage() {
  const {
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
    reload,
    sendMessage,
  } = useMessaging();

  const sidebarConversations = conversations.map((conversation) => ({
    id: conversation.conversationId,
    name: conversation.participant.name,
    role: conversation.participant.role ?? undefined,
    avatar: conversation.participant.avatarUrl ?? undefined,
    lastMessage: conversation.lastMessage,
    lastMessageTime: formatConversationTime(conversation.lastMessageAt),
    unreadCount: conversation.unreadCount,
  }));

  const messageItems = messages.map((message) => ({
    id: message.messageId,
    sender:
      message.senderId === currentUserId ? ("me" as const) : ("them" as const),
    senderName: message.senderName,
    avatar: message.senderAvatarUrl ?? undefined,
    content: message.message,
    timestamp: formatMessageTime(message.createdAt),
    seen: Boolean(message.readAt),
  }));

  return (
    <ChatLayout
      sidebar={
        <ConversationSidebar
          conversations={sidebarConversations}
          selectedConversationId={selectedConversationId ?? undefined}
          onSelectConversation={setSelectedConversationId}
          loading={loadingConversations}
        />
      }
    >
      {loadingConversations ? (
        <LoadingChat />
      ) : error && conversations.length === 0 ? (
        <EmptyChat
          title="Messages unavailable"
          description={error}
          actionLabel="Try again"
          onAction={() => void reload()}
        />
      ) : selectedConversation ? (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <ChatHeader
            name={selectedConversation.participant.name}
            role={selectedConversation.participant.role ?? undefined}
            project={selectedConversation.projectTitle ?? undefined}
            avatar={selectedConversation.participant.avatarUrl ?? undefined}
          />

          {loadingMessages ? (
            <div className="min-h-0 flex-1">
              <LoadingChat />
            </div>
          ) : (
            <MessageScroller messages={messageItems} />
          )}

          {error && messages.length > 0 && (
            <div className="border-t bg-destructive/5 px-4 py-2 text-center text-xs text-destructive">
              {error}
              <Button
                className="ml-2 h-auto p-0"
                variant="link"
                onClick={() => void reload()}
              >
                Retry
              </Button>
            </div>
          )}

          <MessageInput
            onSend={(text) => void sendMessage(text)}
            disabled={sending || loadingMessages}
            placeholder={sending ? "Sending..." : "Write a message..."}
          />
        </div>
      ) : (
        <EmptyChat
          title="No conversations yet"
          description="Your project, order, and job conversations will appear here."
        />
      )}
    </ChatLayout>
  );
}
