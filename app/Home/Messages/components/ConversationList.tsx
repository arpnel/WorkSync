"use client";

import ConversationItem from "./ConversationItem";

export interface Conversation {
  id: string;
  name: string;
  role?: string;
  avatar?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount?: number;
  online?: boolean;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversationId?: string;
  onSelectConversation?: (id: string) => void;
}

export default function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">No conversations found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {conversations.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          id={conversation.id}
          name={conversation.name}
          role={conversation.role}
          avatar={conversation.avatar}
          lastMessage={conversation.lastMessage}
          lastMessageTime={conversation.lastMessageTime}
          unreadCount={conversation.unreadCount}
          online={conversation.online}
          active={selectedConversationId === conversation.id}
          onClick={() => onSelectConversation?.(conversation.id)}
        />
      ))}
    </div>
  );
}
