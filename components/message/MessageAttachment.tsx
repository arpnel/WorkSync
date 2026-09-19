"use client";
import { useState } from "react";
import { FileText, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getMessageAttachmentUrl } from "@/services/message/messageService";
export function attachmentName(value: string) {
  try {
    return decodeURIComponent(
      value.split("?")[0].split("/").pop() || "Attachment",
    ).replace(/^[0-9a-f]{8}-[0-9a-f-]{27}-/i, "");
  } catch {
    return "Attachment";
  }
}
export default function MessageAttachment({
  path,
  type,
}: {
  path: string;
  type?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const open = async () => {
    if (loading) return;
    // Open synchronously so browsers do not block the signed-URL navigation.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setLoading(true);
    try {
      const url = await getMessageAttachmentUrl(path);
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol))
        throw new Error("Invalid attachment URL");
      if (tab) tab.location.replace(url);
      else toast.error("Allow pop-ups to open this attachment.");
    } catch {
      tab?.close();
      toast.error("This attachment is unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  const Icon = loading
    ? Loader2
    : type?.startsWith("image/")
      ? ImageIcon
      : FileText;
  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => void open()}
      className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-current/20 p-3 text-left text-xs hover:opacity-80"
      title="Open attachment in a new tab"
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="truncate">{attachmentName(path)}</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </button>
  );
}
