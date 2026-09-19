"use client";
import { useRef, useState, type KeyboardEvent } from "react";
import { Paperclip, SendHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
interface MessageInputProps {
  onSend: (message: string, attachment?: File) => Promise<boolean> | void;
  onAttach?: () => void;
  allowAttachments?: boolean;
  disabled?: boolean;
  placeholder?: string;
}
export default function MessageInput({
  onSend,
  onAttach,
  allowAttachments = false,
  disabled = false,
  placeholder = "Write a message...",
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<File | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const sendMessage = async () => {
    if ((!message.trim() && !attachment) || disabled || busy.current) return;
    busy.current = true;
    setSubmitting(true);
    try {
      const sent = await onSend(message.trim(), attachment);
      if (sent !== false) {
        setMessage("");
        setAttachment(undefined);
      }
    } catch {
      toast.error("Message could not be sent. Your draft has been kept.");
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void sendMessage();
    }
  };
  return (
    <div className="shrink-0 border-t bg-background px-2 py-3 sm:px-4">
      {attachment && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
          <Paperclip className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {attachment.name} ({(attachment.size / 1024).toFixed(0)} KB)
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remove attachment"
            disabled={disabled || submitting}
            onClick={() => setAttachment(undefined)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="flex items-end gap-2 sm:gap-3">
        {allowAttachments && (
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            aria-label="Choose attachment"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file && file.size > 10 * 1024 * 1024) {
                toast.error("Files must be 10 MB or smaller.");
                return;
              }
              if (file) setAttachment(file);
            }}
          />
        )}
        {(allowAttachments || onAttach) && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() =>
              allowAttachments ? fileInput.current?.click() : onAttach?.()
            }
            disabled={disabled || submitting}
            aria-label="Attach a file (up to 10 MB)"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        )}
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || submitting}
          aria-label="Write a message"
          maxLength={10000}
          rows={1}
          className="max-h-40 min-h-11 resize-none rounded-3xl border-0 bg-muted px-4 py-3 shadow-none"
        />
        <Button
          type="button"
          size="icon"
          onClick={() => void sendMessage()}
          disabled={disabled || submitting || (!message.trim() && !attachment)}
          className="h-11 w-11 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          aria-label="Send message"
        >
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-1.5 pl-1 text-[10px] text-muted-foreground">
        Enter to send ? Shift + Enter for a new line
        {allowAttachments ? " ? Files up to 10 MB" : ""}
      </p>
    </div>
  );
}
