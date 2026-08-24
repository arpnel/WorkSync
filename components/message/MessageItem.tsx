"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message";

export interface MessageItemProps {
  id: string;
  sender: "me" | "them";
  senderName: string;
  avatar?: string;
  content: string;
  timestamp: string;
  seen?: boolean;
}

export default function MessageItem({
  sender,
  senderName,
  avatar,
  content,
  timestamp,
  seen = false,
}: MessageItemProps) {
  const initials = senderName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isMe = sender === "me";

  return (
    <Message align={isMe ? "end" : "start"}>
      <MessageAvatar>
        <Avatar className="h-8 w-8">
          <AvatarImage src={avatar} alt={senderName} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </MessageAvatar>

      <MessageContent>
        <MessageHeader>{senderName}</MessageHeader>

        <div
          className={`max-w-xl rounded-2xl px-4 py-3 text-sm shadow-sm ${
            isMe ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
        >
          {content}
        </div>

        <MessageFooter>
          <span>
            {timestamp}
            {isMe && seen && " • Seen"}
          </span>
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}
