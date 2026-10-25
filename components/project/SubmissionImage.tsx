"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getLargeFileUrl } from "@/services/storage/hybridStorageClient";

export function SubmissionImage({
  path,
  name,
  submissionId,
}: {
  path: string;
  name: string;
  submissionId: string;
}) {
  const [preview, setPreview] = useState<{ path: string; url: string } | null>(
    null,
  );
  const image = /\.(png|jpe?g|webp|gif)$/i.test(path);
  const video = /\.(mp4|m4v|webm|mov)$/i.test(path);
  useEffect(() => {
    if (!image && !video) return;
    let alive = true;
    void (path.startsWith("r2:")
      ? getLargeFileUrl("submission", submissionId)
      : supabase.storage.from("project-attachments").createSignedUrl(path, 3600)
          .then(({ data }) => data?.signedUrl ?? null))
      .then((url) => {
        if (alive && url) setPreview({ path, url });
      })
      .catch(() => {
        /* The download button remains available when preview fails. */
      });
    return () => {
      alive = false;
    };
  }, [path, image, video, submissionId]);
  if ((!image && !video) || preview?.path !== path) return null;
  if (video)
    return (
      <video
        src={preview.url}
        controls
        preload="metadata"
        className="max-h-[520px] w-full rounded-lg border bg-muted/20"
        aria-label={name}
      />
    );
  return (
    // Signed private images are rendered directly without the public image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={preview.url}
      alt={name}
      loading="lazy"
      className="max-h-[520px] w-full rounded-lg border bg-muted/20 object-contain"
    />
  );
}
