"use client";
import { useMemo, useState, type ReactNode } from "react";
import ConversationList, { type Conversation } from "./ConversationList";
import ConversationSearch from "./ConversationSearch";
import { Skeleton } from "@/components/ui/skeleton";
import ConversationSections, {
  sections,
  matchesSection,
  type Section,
} from "./ConversationSections";
interface ConversationSidebarProps {
  menu: ReactNode;
  conversations: Conversation[];
  section: Section;
  onSectionChange: (section: Section) => void;
  selectedConversationId?: string;
  onSelectConversation?: (id: string) => void;
  loading?: boolean;
}
export default function ConversationSidebar({
  menu,
  conversations,
  section,
  onSectionChange,
  selectedConversationId,
  onSelectConversation,
  loading = false,
}: ConversationSidebarProps) {
  const [search, setSearch] = useState("");
  const activeSection = sections.find((item) => item.id === section)!;
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter(
      (c) =>
        matchesSection(c, section) &&
        (!query ||
          [c.name, c.role, c.context, c.lastMessage].some((value) =>
            value?.toLowerCase().includes(query),
          )),
    );
  }, [search, conversations, section]);
  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="shrink-0 space-y-3 px-4 pt-5 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          {menu}
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            Message
          </h1>
        </div>
        <ConversationSearch
          value={search}
          onChange={setSearch}
          placeholder={"Search " + activeSection.label.toLowerCase() + "..."}
        />
        <div className="pt-1">
          <ConversationSections
            conversations={conversations}
            section={section}
            onSectionChange={onSectionChange}
            loading={loading}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div
            role="status"
            aria-label="Loading conversations"
            className="space-y-1 p-2"
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                aria-hidden="true"
                className="flex items-center gap-3 rounded-lg p-3"
              >
                <Skeleton className="size-12 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
                <Skeleton className="h-3 w-8" />
              </div>
            ))}
          </div>
        ) : filteredConversations.length ? (
          <ConversationList
            conversations={filteredConversations}
            selectedConversationId={selectedConversationId}
            onSelectConversation={onSelectConversation}
          />
        ) : (
          <div className="px-6 py-12 text-center" role="status">
            <activeSection.icon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {search.trim()
                ? "No matching conversations"
                : "No " + activeSection.label.toLowerCase() + " yet"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {search.trim()
                ? "Try another name, project title, or message."
                : "Conversations will appear here when created."}
            </p>
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                }}
                className="mt-4 text-xs font-medium text-primary underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
