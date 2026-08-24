"use client";

import { useMemo, useState } from "react";

import ConversationList, { type Conversation } from "./ConversationList";
import ConversationSearch from "./ConversationSearch";

import { Separator } from "@/components/ui/separator";

interface ConversationSidebarProps {
  conversations: Conversation[];
  selectedConversationId?: string;
  onSelectConversation?: (id: string) => void;
}

export default function ConversationSidebar({
  conversations,
  selectedConversationId,
  onSelectConversation,
}: ConversationSidebarProps) {
  const [search, setSearch] = useState("");

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      return (
        conversation.name.toLowerCase().includes(query) ||
        conversation.role?.toLowerCase().includes(query) ||
        conversation.lastMessage.toLowerCase().includes(query)
      );
    });
  }, [search, conversations]);

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="space-y-4 p-4">
        <div>
          <h2 className="text-xl font-semibold">Messages</h2>

          <p className="text-sm text-muted-foreground">Recent conversations</p>
        </div>

        <ConversationSearch value={search} onChange={setSearch} />
      </div>

      <Separator />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ConversationList
          conversations={filteredConversations}
          selectedConversationId={selectedConversationId}
          onSelectConversation={onSelectConversation}
        />
      </div>
    </aside>
  );
}
