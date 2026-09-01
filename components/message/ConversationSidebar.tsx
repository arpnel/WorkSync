"use client";

import { useMemo, useState } from "react";

import ConversationList, { type Conversation } from "./ConversationList";
import ConversationSearch from "./ConversationSearch";

import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

interface ConversationSidebarProps {
  conversations: Conversation[];
  selectedConversationId?: string;
  onSelectConversation?: (id: string) => void;
  loading?: boolean;
}

export default function ConversationSidebar({
  conversations,
  selectedConversationId,
  onSelectConversation,
  loading = false,
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
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <ConversationList
            conversations={filteredConversations}
            selectedConversationId={selectedConversationId}
            onSelectConversation={onSelectConversation}
          />
        )}
      </div>
    </aside>
  );
}
