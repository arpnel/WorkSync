"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

type StoredFile = { bucket: string; path: string };

function resolveStoredFile(bucket: string, storedPath: string): StoredFile {
  let path = storedPath.trim();
  let resolvedBucket = bucket;

  try {
    const url = new URL(path);
    const match = url.pathname.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/,
    );
    if (match) {
      resolvedBucket = decodeURIComponent(match[1]);
      path = decodeURIComponent(match[2]);
    }
  } catch {
    // Stored values are usually private object paths; leave those unchanged.
  }

  const knownBuckets = ["verification-documents", "verification", "resumes"];
  const prefixedBucket = knownBuckets.find((candidate) =>
    path.startsWith(`${candidate}/`),
  );
  if (prefixedBucket) {
    resolvedBucket = prefixedBucket;
    path = path.slice(prefixedBucket.length + 1);
  }

  return { bucket: resolvedBucket, path };
}

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
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    const stored = resolveStoredFile(bucket, path);
    const candidates = [
      stored.bucket,
      bucket,
      ...(label === "Resume / CV" ? ["resumes"] : ["verification"]),
    ];
    const load = async () => {
      setError("");
      let lastError = "";
      for (const candidate of [...new Set(candidates)]) {
        const result = await supabase.storage
          .from(candidate)
          .createSignedUrl(stored.path, 3600);
        if (!alive) return;
        if (!result.error) {
          setUrl(result.data.signedUrl);
          return;
        }
        lastError = result.error.message;
      }
      setError(
        /not found|does not exist/i.test(lastError)
          ? "This file is missing from storage. Remove its entry and upload it again."
          : lastError || "Unable to open this private file.",
      );
    };
    void load();
    const timer = window.setInterval(() => void load(), 50 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [bucket, label, path, attempt]);

  const isPdf = /\.pdf(?:$|[?#])/i.test(path);

  return (
    <div className="min-w-0 space-y-2 py-2">
      {url ? (
        isPdf ? (
          <object data={url} type="application/pdf" className="h-52 w-full">
            <p className="py-2 text-sm text-muted-foreground">
              PDF preview is unavailable in this browser.
            </p>
          </object>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Image
              unoptimized
              width={500}
              height={300}
              src={url}
              alt={label}
              className="max-h-52 w-full rounded-md bg-muted object-contain"
            />
          </a>
        )
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            role={error ? "alert" : "status"}
            className="min-w-0 flex-1 text-sm"
          >
            {error || "Loading preview…"}
          </p>
          {error && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry
            </Button>
          )}
        </div>
      )}
      {url && (
        <a
          className="text-sm underline underline-offset-4"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open {label}
        </a>
      )}
    </div>
  );
}
