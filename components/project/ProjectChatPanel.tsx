"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceMessage } from "@/types/project/projectWorkspace";

type Props = {
  messages: WorkspaceMessage[];
  sending: boolean;
  isOtherParticipantTyping: boolean;
  onSend: (message: string, attachment?: File) => Promise<boolean>;
  onTypingChange: (isTyping: boolean) => void;
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function MessageAttachment({ message }: { message: WorkspaceMessage }) {
  if (!message.attachmentUrl) return null;

  if (message.attachmentType?.startsWith("image/")) {
    return (
      <a href={message.attachmentUrl} target="_blank" rel="noreferrer">
        <Image
          src={message.attachmentUrl}
          alt="Message attachment"
          width={360}
          height={240}
          unoptimized
          className="mt-2 max-h-60 w-auto max-w-full rounded-md object-contain"
        />
      </a>
    );
  }

  if (message.attachmentType?.startsWith("video/")) {
    return (
      <video
        src={message.attachmentUrl}
        controls
        className="mt-2 max-h-60 max-w-full rounded-md"
      />
    );
  }

  return (
    <a
      href={message.attachmentUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex items-center gap-2 rounded-md border border-current/20 px-3 py-2 text-xs"
    >
      <FileText className="h-4 w-4 shrink-0" />
      Open attachment
    </a>
  );
}

export function ProjectChatPanel({
  messages,
  sending,
  isOtherParticipantTyping,
  onSend,
  onTypingChange,
}: Props) {
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isOtherParticipantTyping]);

  useEffect(
    () => () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      onTypingChange(false);
    },
    [onTypingChange],
  );

  const updateDraft = (value: string) => {
    setDraft(value);
    onTypingChange(Boolean(value.trim()));

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onTypingChange(false), 1200);
  };

  const submit = async () => {
    const content = draft.trim();
    if ((!content && !attachment) || sending) return;
    onTypingChange(false);

    if (await onSend(content, attachment ?? undefined)) {
      setDraft("");
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Card className="flex h-[min(70vh,640px)] min-h-[480px] flex-col overflow-hidden">
      <CardHeader className="shrink-0 border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" />
          Project Chat
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div
          ref={messagesViewportRef}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4"
        >
          {messages.length ? (
            messages.map((item) => (
              <div
                key={item.id}
                className={
                  item.mine
                    ? "flex flex-row-reverse items-end gap-2"
                    : "flex items-end gap-2"
                }
              >
                <Avatar size="sm">
                  <AvatarImage
                    src={item.senderAvatarUrl ?? undefined}
                    alt={item.senderName}
                  />
                  <AvatarFallback>{initials(item.senderName)}</AvatarFallback>
                </Avatar>
                <div className="max-w-[82%]">
                  <div
                    className={
                      item.mine
                        ? "mb-1 flex justify-end gap-2"
                        : "mb-1 flex gap-2"
                    }
                  >
                    <span className="text-xs font-medium">
                      {item.mine ? "You" : item.senderName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div
                    className={
                      item.mine
                        ? "rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                        : "rounded-lg bg-muted px-3 py-2 text-sm"
                    }
                  >
                    {item.message && (
                      <p className="whitespace-pre-wrap break-words">
                        {item.message}
                      </p>
                    )}
                    <MessageAttachment message={item} />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="flex h-full min-h-64 items-center justify-center text-sm text-muted-foreground">
              No messages yet.
            </div>
          )}
          {isOtherParticipantTyping && (
            <div className="flex items-end gap-2">
              <Avatar size="sm">
                <AvatarFallback>...</AvatarFallback>
              </Avatar>
              <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-3">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
                <span className="sr-only">Typing</span>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t p-3">
          {attachment && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-xs">
              <span className="truncate">{attachment.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove attachment"
                onClick={() => setAttachment(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
              className="hidden"
              onChange={(event) =>
                setAttachment(event.target.files?.[0] ?? null)
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Attach a file"
              disabled={sending}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              value={draft}
              onChange={(event) => updateDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="Write a message..."
              className="max-h-28 min-h-11 resize-none"
            />
            <Button
              type="button"
              size="icon"
              aria-label="Send message"
              disabled={(!draft.trim() && !attachment) || sending}
              onClick={() => void submit()}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Images, videos, documents, or ZIP files up to 10 MB
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
