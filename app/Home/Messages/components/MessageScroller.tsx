"use client";

import { useEffect, useRef } from "react";

import { MessageGroup } from "@/components/ui/message";

import MessageItem, { type MessageItemProps } from "./MessageItem";

interface MessageScrollerProps {
  messages: MessageItemProps[];
}

export default function MessageScroller({ messages }: MessageScrollerProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">No messages yet.</p>
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
