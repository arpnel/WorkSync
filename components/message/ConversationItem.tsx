"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ConversationItemProps {
  id: string;
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
      className={cn(
        "w-full min-w-0 overflow-hidden rounded-xl border p-3 text-left transition-all",
        "hover:bg-muted/50",
        active && "border-primary bg-primary/5",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="relative">
          <Avatar className="h-11 w-11">
            <AvatarImage src={avatar} alt={name} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          {online && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h3 className="truncate font-medium">{name}</h3>

            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {lastMessageTime}
            </span>
          </div>

          {role && (
            <p className="truncate text-xs text-muted-foreground">{role}</p>
          )}

          <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
            {" "}
            <p className="truncate text-sm text-muted-foreground">
              {lastMessage}
            </p>
            {unreadCount > 0 && (
              <Badge className="min-w-5 rounded-full px-1.5 text-xs">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
