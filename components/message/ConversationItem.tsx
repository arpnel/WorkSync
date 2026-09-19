"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pin, Ban, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConversationItemProps {
  id: string;
  pinned?: boolean;
  blocked?: boolean;
  archived?: boolean;
  name: string;
  role?: string;
  avatar?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount?: number;
  online?: boolean;
  active?: boolean;
  onClick?: () => void;
}

export default function ConversationItem({
  pinned,
  blocked,
  archived,
  name,
  role,
  avatar,
  lastMessage,
  lastMessageTime,
  unreadCount = 0,
  online = false,
  active = false,
  onClick,
}: ConversationItemProps) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "w-full min-w-0 overflow-hidden rounded-lg p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        "hover:bg-muted/50",
        active &&
          "bg-blue-50 hover:bg-blue-50 dark:bg-blue-500/15 dark:hover:bg-blue-500/15",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative shrink-0">
          <Avatar className="h-14 w-14">
            <AvatarImage src={avatar} alt={name} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          {online && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h3
              className={cn(
                "truncate text-[15px]",
                unreadCount > 0 ? "font-semibold" : "font-medium",
              )}
            >
              {name}
            </h3>
            {blocked ? (
              <Ban
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-label="Blocked"
              />
            ) : archived ? (
              <Archive
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-label="Archived"
              />
            ) : pinned ? (
              <Pin
                className="h-3.5 w-3.5 shrink-0 text-primary"
                aria-label="Pinned"
              />
            ) : null}
          </div>

          {role && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {role}
            </p>
          )}
          <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
            <p
              className={cn(
                "min-w-0 truncate text-[13px]",
                unreadCount > 0
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {lastMessage}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end justify-between self-stretch py-1">
          <div className="flex h-3 items-center justify-end">
            {unreadCount > 0 && (
              <span
                className="h-3 w-3 rounded-full bg-blue-500"
                aria-label={`${unreadCount} unread messages`}
              />
            )}
          </div>
          <span className="text-right text-[11px] whitespace-nowrap text-muted-foreground">
            {lastMessageTime}
          </span>
        </div>
      </div>
    </button>
  );
}
