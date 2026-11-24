"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { FileText, ImageIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getMessageAttachmentUrl } from "@/services/message/messageService";
import { supabase } from "@/lib/supabaseClient";
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
  recordId,
}: {
  path: string;
  type?: string | null;
  recordId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    /^https?:\/\//i.test(path) && (type?.startsWith("image/") || type?.startsWith("video/")) ? path : null,
  );
  const isImage = type?.startsWith("image/") ?? false;
  const isVideo = type?.startsWith("video/") ?? false;
  const isPreviewableMedia = isImage || isVideo;

  useEffect(() => {
    if (!isPreviewableMedia || /^https?:\/\//i.test(path)) {
      setPreviewUrl(isPreviewableMedia ? path : null);
      return;
    }
    let active = true;
    let downloadedPreview: string | null = null;
    setPreviewUrl(null);
    void getMessageAttachmentUrl(path, recordId)
      .then((url) => {
        if (active) setPreviewUrl(url);
      })
      .catch(() => {
        if (!isImage) {
          if (active) setPreviewUrl(null);
          return;
        }
        void supabase.storage
          .from("message-attachments")
          .download(path)
          .then(({ data, error }) => {
            if (error || !data) throw error ?? new Error("Image download failed");
            downloadedPreview = URL.createObjectURL(data);
            if (active) setPreviewUrl(downloadedPreview);
            else URL.revokeObjectURL(downloadedPreview);
          })
          .catch(() => {
            if (active) setPreviewUrl(null);
          });
      });
    return () => {
      active = false;
      if (downloadedPreview) URL.revokeObjectURL(downloadedPreview);
    };
  }, [isImage, isPreviewableMedia, path, recordId]);

  const open = async () => {
    if (loading) return;
    const tab = isImage ? null : window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setLoading(true);
    try {
      const url = previewUrl ?? (await getMessageAttachmentUrl(path, recordId));
      const parsed = new URL(url, window.location.href);
      if (!["http:", "https:", "blob:"].includes(parsed.protocol))
        throw new Error("Invalid attachment URL");
      if (isImage) {
        setPreviewUrl(url);
        setImagePreviewOpen(true);
      } else if (tab) {
        tab.location.replace(url);
      } else {
        toast.error("Allow pop-ups to open this attachment.");
      }
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
  if (isVideo && previewUrl) {
    return <video src={previewUrl} controls preload="metadata" className="mt-2 max-h-72 max-w-full rounded-xl" aria-label={attachmentName(path)} />;
  }
  if (isImage && previewUrl) {
    return (
      <>
        <button
          type="button"
          onClick={() => setImagePreviewOpen(true)}
          className="mt-2 block max-w-full overflow-hidden rounded-xl border border-current/20 hover:opacity-90"
          aria-label={`View image ${attachmentName(path)}`}
        >
          <Image
            src={previewUrl}
            alt={attachmentName(path)}
            width={480}
            height={320}
            unoptimized
            className="max-h-72 max-w-full object-contain"
            loading="lazy"
          />
        </button>
        <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
          <DialogContent
            showCloseButton={false}
            className="fixed inset-0 left-0 top-0 z-[70] flex h-dvh min-h-0 max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#08090b] p-0 text-white ring-0 sm:max-w-none"
          >
            <DialogHeader className="absolute inset-x-0 top-0 z-10 flex h-14 flex-row items-center justify-between border-b border-white/10 bg-black/55 px-5 text-left backdrop-blur-sm">
              <DialogTitle className="truncate text-sm font-medium text-white">
                {attachmentName(path)}
              </DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close image preview"
                className="shrink-0 text-white hover:bg-white/10 hover:text-white"
                onClick={() => setImagePreviewOpen(false)}
              >
                <X className="size-5" />
              </Button>
              <DialogDescription className="sr-only">
                Full-screen image preview.
              </DialogDescription>
            </DialogHeader>
            <div className="flex h-full min-h-0 w-full items-center justify-center p-3 pt-16 sm:p-6 sm:pt-16">
              <Image
                src={previewUrl}
                alt={attachmentName(path)}
                width={1600}
                height={1200}
                unoptimized
                className="h-full w-full object-contain"
                priority
              />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={loading}
        onClick={() => void open()}
        className="flex w-full min-w-0 cursor-pointer items-center justify-center gap-2 text-center text-xs underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={isImage ? "Preview image" : "Open attachment in a new tab"}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="truncate">{attachmentName(path)}</span>
        <span className="sr-only">
          {isImage ? " (preview image)" : " (opens in a new tab)"}
        </span>
      </button>
    </>
  );
}
