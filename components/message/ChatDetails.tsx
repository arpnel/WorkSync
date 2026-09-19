"use client";
import { useMemo, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatMessage } from "@/types/message/message";
import MessageAttachment, { attachmentName } from "./MessageAttachment";
export default function ChatDetails({
  messages,
  loading,
  onClose,
}: {
  messages: ChatMessage[];
  loading: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"media" | "files" | "links">("files");
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    const results: {
      key: string;
      message: ChatMessage;
      path: string;
      label: string;
      link: boolean;
    }[] = [];
    for (const message of [...messages].reverse()) {
      if (tab === "links") {
        for (const [index, url] of [
          ...new Set(message.message.match(/https?:\/\/[^\s<>]+/gi) ?? []),
        ].entries()) {
          const cleaned = url.replace(/[.,;!?)\]]+$/, "");
          results.push({
            key: message.messageId + index,
            message,
            path: cleaned,
            label: cleaned,
            link: true,
          });
        }
      } else if (message.attachmentUrl) {
        const media = /^(image|video|audio)\//.test(
          message.attachmentType ?? "",
        );
        if ((tab === "media") === media)
          results.push({
            key: message.messageId,
            message,
            path: message.attachmentUrl,
            label: attachmentName(message.attachmentUrl),
            link: false,
          });
      }
    }
    return results.filter((item) =>
      (item.label + " " + item.message.senderName + " " + item.message.message)
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    );
  }, [messages, tab, query]);
  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-label="Shared conversation content"
    >
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="font-semibold">Shared media, files & links</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close shared content"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-3 p-4">
        <div
          className="flex gap-2"
          role="group"
          aria-label="Shared content type"
        >
          {(["media", "files", "links"] as const).map((value) => (
            <Button
              key={value}
              variant={tab === value ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              className="capitalize"
            >
              {value}
            </Button>
          ))}
        </div>
        <Input
          aria-label="Search shared content"
          placeholder="Search by file name, sender, or message..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading shared content...
          </p>
        ) : items.length ? (
          items.map((item) => (
            <div key={item.key} className="rounded-xl border p-3">
              {item.link ? (
                <a
                  href={item.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary underline"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </a>
              ) : (
                <MessageAttachment
                  path={item.path}
                  type={item.message.attachmentType}
                />
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {item.message.senderName} ?{" "}
                {new Date(item.message.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {query
              ? "No matching shared content."
              : "No shared " + tab + " yet."}
          </p>
        )}
      </div>
    </section>
  );
}
