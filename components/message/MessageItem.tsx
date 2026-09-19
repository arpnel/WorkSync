"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import MessageAttachment from "./MessageAttachment";
import CallMessage from "@/components/calls/CallMessage";
import { cn } from "@/lib/utils";

export interface MessageItemProps {
  id: string;
  sender: "me" | "them";
  senderName: string;
  avatar?: string;
  content: string;
  timestamp: string;
  seen?: boolean;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
}

export default function MessageItem({
  sender,
  senderName,
  avatar,
  content,
  timestamp,
  seen = false,
  attachmentUrl,
  attachmentType,
}: MessageItemProps) {
  const initials = senderName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isMe = sender === "me";

  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-2",
        isMe && "flex-row-reverse",
      )}
    >
      <Avatar className="mt-5 h-8 w-8 shrink-0">
        <AvatarImage src={avatar} alt={senderName} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "flex min-w-0 max-w-[calc(100%-2.5rem)] flex-col gap-1 sm:max-w-[75%] lg:max-w-[65%]",
          isMe ? "items-end" : "items-start",
        )}
      >
        <p className="max-w-full px-2 text-xs font-medium break-words text-muted-foreground">
          {senderName}
        </p>
        <div
          className={cn(
            "w-fit max-w-full rounded-3xl px-4 py-2.5 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]",
            isMe ? "bg-blue-500 text-white" : "bg-muted",
          )}
        >
          <CallMessage content={content} />
          {attachmentUrl && (
            <div className="mt-2">
              <MessageAttachment path={attachmentUrl} type={attachmentType} />
            </div>
          )}
        </div>
        <p
          className={cn(
            "max-w-full px-2 text-[11px] text-muted-foreground",
            isMe && "text-right",
          )}
        >
          {timestamp}
          {isMe && seen && " \u00b7 Seen"}
        </p>
      </div>
    </div>
  );
}
