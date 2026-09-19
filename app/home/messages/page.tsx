"use client";

import MessageMenu from "@/components/message/MessageMenu";
import CallButton from "@/components/calls/CallButton";
import { callPreview } from "@/lib/calls/callMessage";
import ChatActions from "@/components/message/ChatActions";
import { Input } from "@/components/ui/input";
import { MoreHorizontal, X } from "lucide-react";
import { useState } from "react";
import { type Section } from "@/components/message/ConversationSections";

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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageQuery, setMessageQuery] = useState("");
  const [section, setSection] = useState<Section>("all");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const {
    preferences,
    preferencesReady,
    savingPreference,
    updatePreference,
    blockUser,
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

  const selectedPreference = preferences.preferences.find(
    (p) => p.conversation_id === selectedConversationId,
  );
  const blocked = preferences.blockedUserIds.includes(
    selectedConversation?.participant.userId ?? "",
  );
  const blockedBy = preferences.blockedByUserIds.includes(
    selectedConversation?.participant.userId ?? "",
  );

  const sidebarConversations = conversations.map((conversation) => ({
    id: conversation.conversationId,
    archived:
      preferences.preferences.find(
        (p) => p.conversation_id === conversation.conversationId,
      )?.is_archived ?? false,
    pinned:
      preferences.preferences.find(
        (p) => p.conversation_id === conversation.conversationId,
      )?.is_pinned ?? false,
    blocked: preferences.blockedUserIds.includes(
      conversation.participant.userId,
    ),
    category: conversation.projectId
      ? ("projects" as const)
      : conversation.orderId
        ? ("orders" as const)
        : conversation.jobId
          ? ("jobs" as const)
          : ("direct" as const),
    context: conversation.projectId
      ? (conversation.projectTitle ?? "Project conversation")
      : conversation.orderId
        ? "Order conversation"
        : conversation.jobId
          ? "Job conversation"
          : "Direct conversation",
    name: conversation.participant.name,
    role: conversation.participant.role ?? undefined,
    avatar: conversation.participant.avatarUrl ?? undefined,
    lastMessage: callPreview(conversation.lastMessage),
    lastMessageTime: formatConversationTime(conversation.lastMessageAt),
    unreadCount: conversation.unreadCount,
  }));

  sidebarConversations.sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const filteredMessages = messages.filter(
    (message) =>
      !searchOpen ||
      callPreview(message.message)
        .toLowerCase()
        .includes(messageQuery.trim().toLowerCase()),
  );
  const messageItems = filteredMessages.map((message) => ({
    id: message.messageId,
    sender:
      message.senderId === currentUserId ? ("me" as const) : ("them" as const),
    senderName: message.senderName,
    avatar: message.senderAvatarUrl ?? undefined,
    content: message.message,
    attachmentUrl: message.attachmentUrl,
    attachmentType: message.attachmentType,
    timestamp: formatMessageTime(message.createdAt),
    seen: Boolean(message.readAt),
  }));

  return (
    <ChatLayout
      mobileChatOpen={mobileChatOpen}
      sidebar={
        <ConversationSidebar
          menu={
            <MessageMenu
              conversations={conversations}
              preferences={preferences}
              loading={loadingConversations}
              ready={preferencesReady}
              saving={savingPreference}
              onRestore={(id) => updatePreference(id, { is_archived: false })}
              onUnblock={(id) => blockUser(id, false)}
              onRetry={() => void reload()}
              onOpenChat={(id) => {
                setDetailsOpen(false);
                setSearchOpen(false);
                setMessageQuery("");
                setSelectedConversationId(id);
                setMobileChatOpen(true);
              }}
            />
          }
          section={section}
          onSectionChange={setSection}
          conversations={sidebarConversations}
          selectedConversationId={selectedConversationId ?? undefined}
          onSelectConversation={(id) => {
            setDetailsOpen(false);
            setSearchOpen(false);
            setMessageQuery("");
            setSelectedConversationId(id);
            setMobileChatOpen(true);
          }}
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
        <div className="@container/chat-pane flex h-full min-h-0 min-w-0 overflow-hidden">
          <div
            className={
              detailsOpen
                ? "hidden h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden @min-[48rem]/chat-pane:flex"
                : "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            }
          >
            <ChatHeader
              actions={
                <>
                  <CallButton
                    conversationId={selectedConversation.conversationId}
                    disabled={blocked || blockedBy}
                  />
                  <Button
                    id="chat-menu-toggle"
                    variant="ghost"
                    size="icon"
                    aria-label="Chat menu"
                    aria-expanded={detailsOpen}
                    aria-controls={
                      detailsOpen ? "chat-details-panel" : undefined
                    }
                    onClick={() => setDetailsOpen((open) => !open)}
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </>
              }
              onBack={() => setMobileChatOpen(false)}
              name={selectedConversation.participant.name}
              role={selectedConversation.participant.role ?? undefined}
              project={selectedConversation.projectTitle ?? undefined}
              avatar={selectedConversation.participant.avatarUrl ?? undefined}
            />

            {!preferencesReady && (
              <p className="border-b px-4 py-2 text-xs text-muted-foreground">
                Chat organization and blocking are currently unavailable.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => void reload()}
                >
                  Retry
                </button>
              </p>
            )}
            {(selectedPreference?.is_archived ||
              selectedPreference?.is_pinned) && (
              <p className="border-b px-4 py-2 text-xs text-muted-foreground">
                {selectedPreference.is_pinned ? "Pinned chat. " : ""}
                {selectedPreference.is_archived
                  ? "Archived - restore it from the chat menu to return it to your inbox."
                  : ""}
              </p>
            )}
            {searchOpen && (
              <div className="flex items-center gap-2 border-b px-4 py-2">
                <Input
                  autoFocus
                  aria-label="Search in conversation"
                  placeholder="Search in conversation..."
                  value={messageQuery}
                  onChange={(event) => setMessageQuery(event.target.value)}
                />
                <span
                  role="status"
                  className="shrink-0 text-xs text-muted-foreground"
                >
                  {filteredMessages.length} results
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close message search"
                  onClick={() => {
                    setSearchOpen(false);
                    setMessageQuery("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            {loadingMessages ? (
              <div className="min-h-0 flex-1">
                <LoadingChat messagesOnly />
              </div>
            ) : (
              <MessageScroller
                key={`history:${selectedConversation.conversationId}`}
                messages={messageItems}
                searching={searchOpen}
              />
            )}

            {error && (
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

            {(blocked || blockedBy) && (
              <p
                role="status"
                className="border-t px-4 py-3 text-center text-sm text-muted-foreground"
              >
                {blocked
                  ? "You blocked this user. Unblock them from the chat menu to send messages."
                  : "Messaging is unavailable for this conversation."}
              </p>
            )}
            <MessageInput
              key={`composer:${selectedConversation.conversationId}`}
              allowAttachments
              onSend={sendMessage}
              disabled={sending || loadingMessages || blocked || blockedBy}
              placeholder={sending ? "Sending..." : "Write a message..."}
            />
          </div>
          {detailsOpen && (
            <aside
              id="chat-details-panel"
              aria-labelledby="chat-panel-title"
              className="flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden bg-background @min-[48rem]/chat-pane:w-80 @min-[48rem]/chat-pane:border-l"
            >
              <ChatActions
                key={`actions:${selectedConversation.conversationId}`}
                avatar={selectedConversation.participant.avatarUrl ?? undefined}
                role={selectedConversation.participant.role ?? undefined}
                project={selectedConversation.projectTitle ?? undefined}
                messages={messages}
                loading={loadingMessages}
                onClose={() => {
                  setDetailsOpen(false);
                  requestAnimationFrame(() =>
                    document.getElementById("chat-menu-toggle")?.focus(),
                  );
                }}
                userId={selectedConversation.participant.userId}
                name={selectedConversation.participant.name}
                archived={selectedPreference?.is_archived ?? false}
                pinned={selectedPreference?.is_pinned ?? false}
                blocked={blocked}
                disabled={!preferencesReady || savingPreference}
                onArchive={() =>
                  void updatePreference(selectedConversation.conversationId, {
                    is_archived: !selectedPreference?.is_archived,
                  })
                }
                onPin={() =>
                  void updatePreference(selectedConversation.conversationId, {
                    is_pinned: !selectedPreference?.is_pinned,
                  })
                }
                onBlock={() =>
                  void blockUser(
                    selectedConversation.participant.userId,
                    !blocked,
                  )
                }
                onSearch={() => {
                  setSearchOpen(true);
                  setDetailsOpen(false);
                }}
              />
            </aside>
          )}
        </div>
      ) : (
        <EmptyChat
          title={
            conversations.length
              ? "Select a conversation"
              : "No conversations yet"
          }
          description={
            conversations.length
              ? "Choose a chat from your inbox to start messaging."
              : "Your project, order, and job conversations will appear here."
          }
        />
      )}
    </ChatLayout>
  );
}
