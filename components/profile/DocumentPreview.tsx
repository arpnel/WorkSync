"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

export function DocumentPreview({
  bucket,
  path,
  label,
}: {
  bucket: string;
  path: string;
  label: string;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const result = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 3600);
      if (!alive) return;
      if (result.error) setError(result.error.message);
      else {
        setUrl(result.data.signedUrl);
        setError("");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 50 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [bucket, path]);
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border">
      {url ? (
        /\.pdf$/i.test(path) ? (
          <object data={url} type="application/pdf" className="h-64 w-full">
            <p className="p-4">PDF preview is unavailable in this browser.</p>
          </object>
        ) : (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Image
              unoptimized
              width={500}
              height={300}
              src={url}
              alt={label}
              className="h-64 w-full bg-muted object-contain"
            />
          </a>
        )
      ) : (
        <p className="p-4 text-sm">{error || "Loading preview…"}</p>
      )}
      <div className="p-3">
        {url ? (
          <a
            className="text-sm underline"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {label} · Open full size
          </a>
        ) : (
          label
        )}
      </div>
    </div>
  );
}
