"use client";

import { useEffect, useRef } from "react";

import { MessageGroup } from "@/components/ui/message";

import MessageItem, { type MessageItemProps } from "./MessageItem";

interface MessageScrollerProps {
  messages: MessageItemProps[];
  searching?: boolean;
  introduction?: string;
}

export default function MessageScroller({
  messages,
  searching = false,
  introduction,
}: MessageScrollerProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => {
    if (searching) return;
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [lastMessageId, searching]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
      {introduction && !searching && (
        <p className="mx-auto mb-5 max-w-md rounded-full border bg-muted/40 px-4 py-2 text-center text-xs text-muted-foreground">
          {introduction}
        </p>
      )}
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">
            {searching ? "No matching messages." : "No messages yet."}
          </p>
        </div>
      ) : (
        <MessageGroup>
          {messages.map((message) => (
            <MessageItem key={message.id} {...message} />
          ))}

          <div ref={bottomRef} />
        </MessageGroup>
      )}
    </div>
  );
}
