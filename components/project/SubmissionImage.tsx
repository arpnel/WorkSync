"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function SubmissionImage({
  path,
  name,
}: {
  path: string;
  name: string;
}) {
  const [preview, setPreview] = useState<{ path: string; url: string } | null>(
    null,
  );
  const image = /\.(png|jpe?g|webp|gif)$/i.test(path);
  useEffect(() => {
    if (!image) return;
    let alive = true;
    void supabase.storage
      .from("project-attachments")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (alive && data?.signedUrl) setPreview({ path, url: data.signedUrl });
      })
      .catch(() => {
        /* The download button remains available when preview fails. */
      });
    return () => {
      alive = false;
    };
  }, [path, image]);
  if (!image || preview?.path !== path) return null;
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
