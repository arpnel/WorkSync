"use client";

import { type KeyboardEvent, useState } from "react";
import { Paperclip, SendHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface MessageInputProps {
  onSend: (message: string) => void;
  onAttach?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function MessageInput({
  onSend,
  onAttach,
  disabled = false,
  placeholder = "Write a message...",
}: MessageInputProps) {
  const [message, setMessage] = useState("");

  const sendMessage = () => {
    const trimmed = message.trim();

    if (!trimmed || disabled) return;

    onSend(trimmed);
    setMessage("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="shrink-0 border-t bg-background p-4">
      <div className="flex items-end gap-3">
        {onAttach && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onAttach}
            disabled={disabled}
            aria-label="Attach a file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        )}

        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="max-h-40 min-h-11 resize-none"
        />

        <Button
          type="button"
          size="icon"
          onClick={sendMessage}
          disabled={disabled || !message.trim()}
          aria-label="Send message"
        >
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
