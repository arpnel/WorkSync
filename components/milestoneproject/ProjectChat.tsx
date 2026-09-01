"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import {
  MessageSquare,
  Send,
} from "lucide-react";

interface ChatMessage {
  id: number;
  sender: "client" | "freelancer";
  name: string;
  initials: string;
  time: string;
  message: string;
}

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    sender: "client",
    name: "Sarah",
    initials: "SJ",
    time: "10:42 AM",
    message:
      "I would like to split the project into three milestones.",
  },
  {
    id: 2,
    sender: "freelancer",
    name: "Alex",
    initials: "AM",
    time: "10:45 AM",
    message:
      "That works for me. I added the proposed milestones.",
  },
  {
    id: 3,
    sender: "client",
    name: "Sarah",
    initials: "SJ",
    time: "10:48 AM",
    message:
      "Can we move ₱1,000 from development to the final integration milestone?",
  },
];

export default function ProjectChat() {
  const [messages, setMessages] =
    React.useState<ChatMessage[]>(initialMessages);

  const [message, setMessage] = React.useState("");

  const handleSend = () => {
    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      return;
    }

    const newMessage: ChatMessage = {
      id: Date.now(),
      sender: "freelancer",
      name: "Alex",
      initials: "AM",
      time: new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      }),
      message: trimmedMessage,
    };

    setMessages((current) => [...current, newMessage]);
    setMessage("");
  };

  return (
    <Card
      className="
        flex
        min-h-[500px]
        flex-col
        overflow-hidden
        lg:min-h-[600px]
        xl:min-h-[680px]
      "
    >
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span>Project Chat</span>
          </CardTitle>

          <Badge
            variant="secondary"
            className="shrink-0"
          >
            2 members
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col p-0">
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {messages.map((item) => {
            const isFreelancer =
              item.sender === "freelancer";

            return (
              <div
                key={item.id}
                className={
                  isFreelancer
                    ? "flex flex-row-reverse gap-3"
                    : "flex gap-3"
                }
              >
                <div
                  className={
                    isFreelancer
                      ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground"
                      : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
                  }
                >
                  {item.initials}
                </div>

                <div className="min-w-0 max-w-[85%]">
                  <div
                    className={
                      isFreelancer
                        ? "mb-1 flex flex-wrap items-center justify-end gap-2"
                        : "mb-1 flex flex-wrap items-center gap-2"
                    }
                  >
                    {!isFreelancer && (
                      <span className="text-sm font-medium">
                        {item.name}
                      </span>
                    )}

                    <span className="text-xs text-muted-foreground">
                      {item.time}
                    </span>

                    {isFreelancer && (
                      <span className="text-sm font-medium">
                        {item.name}
                      </span>
                    )}
                  </div>

                  <div
                    className={
                      isFreelancer
                        ? "rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                        : "rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm"
                    }
                  >
                    {item.message}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={message}
              onChange={(event) =>
                setMessage(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Write a message..."
              className="min-h-[44px] resize-none"
            />

            <Button
              size="icon"
              className="shrink-0"
              onClick={handleSend}
              disabled={!message.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          <p className="mt-1.5 hidden text-[11px] text-muted-foreground sm:block">
            Press Enter to send · Shift + Enter for a new line
          </p>
        </div>
      </CardContent>
    </Card>
  );
}