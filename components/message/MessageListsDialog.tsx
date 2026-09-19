"use client";

import { useState } from "react";
import { Archive, Ban, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  MessageConversation,
  MessagingPreferences,
} from "@/types/message/message";

export interface MessageListsProps {
  conversations: MessageConversation[];
  preferences: MessagingPreferences;
  loading: boolean;
  ready: boolean;
  saving: boolean;
  onRestore: (conversationId: string) => Promise<void>;
  onUnblock: (userId: string) => Promise<void>;
  onOpenChat: (conversationId: string) => void;
  onRetry: () => void;
}
interface Props extends MessageListsProps {
  view: "archived" | "blocked";
  onClose: () => void;
  onReturnFocus: () => void;
}

export default function MessageListsDialog({
  view,
  conversations,
  preferences,
  loading,
  ready,
  saving,
  onRestore,
  onUnblock,
  onOpenChat,
  onRetry,
  onClose,
  onReturnFocus,
}: Props) {
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const archived = view === "archived";
  const Icon = archived ? Archive : Ban;
  const archivedIds = new Set(
    preferences.preferences
      .filter((p) => p.is_archived)
      .map((p) => p.conversation_id),
  );
  const rows = archived
    ? conversations
        .filter((c) => archivedIds.has(c.conversationId))
        .map((c) => ({
          id: c.conversationId,
          name: c.participant.name,
          avatar: c.participant.avatarUrl,
          detail:
            c.projectTitle ||
            (c.orderId
              ? "Order conversation"
              : c.jobId
                ? "Job conversation"
                : "Direct conversation"),
          blocked: preferences.blockedUserIds.includes(c.participant.userId),
        }))
    : [...new Set(preferences.blockedUserIds)].map((userId) => {
        const participant = conversations.find(
          (c) => c.participant.userId === userId,
        )?.participant;
        return {
          id: userId,
          name: participant?.name || "WorkSync user",
          avatar: participant?.avatarUrl,
          detail: participant?.role || "Blocked user",
          blocked: true,
        };
      });
  const filtered = rows.filter((row) =>
    (row.name + " " + row.detail)
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const act = async (id: string) => {
    if (saving || pendingId) return;
    setPendingId(id);
    try {
      await (archived ? onRestore(id) : onUnblock(id));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[80dvh] flex-col gap-4 sm:max-w-lg"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onReturnFocus();
        }}
      >
        <DialogHeader className="pr-6">
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            {archived ? "Archived chats" : "Blocked users"}
          </DialogTitle>
          <DialogDescription>
            {archived
              ? "Open a past conversation or restore it to your inbox."
              : "Manage people you have blocked. Unblocking allows messaging unless they have also blocked you."}
          </DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            archived
              ? "Search people or projects..."
              : "Search blocked users..."
          }
          aria-label={
            archived ? "Search archived chats" : "Search blocked users"
          }
        />
        <div className="min-h-0 overflow-y-auto" aria-busy={loading || saving}>
          {loading ? (
            <p
              role="status"
              className="py-10 text-center text-sm text-muted-foreground"
            >
              Loading...
            </p>
          ) : !ready ? (
            <div className="space-y-3 py-8 text-center">
              <p role="status" className="text-sm text-muted-foreground">
                This list is currently unavailable.
              </p>
              <Button variant="outline" size="sm" onClick={onRetry}>
                Try again
              </Button>
            </div>
          ) : filtered.length ? (
            <ul className="divide-y">
              {filtered.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={row.avatar ?? undefined} alt={row.name} />
                    <AvatarFallback>
                      {row.name
                        .split(" ")
                        .map((word) => word[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.detail}
                    </p>
                    {archived && row.blocked && (
                      <p className="text-xs text-muted-foreground">
                        User blocked - unblock to return this chat to the inbox.
                      </p>
                    )}
                  </div>
                  <div className="ml-auto flex shrink-0 gap-1">
                    {archived && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onOpenChat(row.id);
                          onClose();
                        }}
                        aria-label={"Open chat with " + row.name}
                      >
                        Open
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={saving || pendingId !== null}
                      onClick={() => void act(row.id)}
                      aria-label={
                        (archived ? "Restore chat with " : "Unblock ") +
                        row.name
                      }
                    >
                      {pendingId === row.id && (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      {archived ? "Restore" : "Unblock"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div role="status" className="py-10 text-center">
              <Icon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">
                {query.trim()
                  ? "No matching results"
                  : archived
                    ? "No archived chats"
                    : "No blocked users"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {query.trim()
                  ? "Try another name."
                  : archived
                    ? "Chats you archive will appear here."
                    : "People you block will appear here."}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
