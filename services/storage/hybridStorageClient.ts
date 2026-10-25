import { supabase } from "@/lib/supabaseClient";
import { usesR2Storage } from "@/lib/storage/hybridStorage";

type LargeUploadTarget = {
  purpose: "message" | "submission" | "dispute";
  targetId: string;
};
type PartTicket = { partNumber: number; url: string };

async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token)
    throw new Error("Your session expired. Sign in again.");
  return data.session.access_token;
}

async function responseJson<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(value?.error ?? "Secure file storage is unavailable.");
  if (!value) throw new Error("Secure file storage returned an invalid response.");
  return value;
}

function putPart(
  url: string,
  blob: Blob,
  signal?: AbortSignal,
  onProgress?: (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300)
        reject(new Error(`A file part failed to upload (${xhr.status}).`));
      else {
        const etag = xhr.getResponseHeader("ETag");
        if (!etag) reject(new Error("Cloud storage did not confirm the uploaded file part."));
        else resolve(etag);
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading a file part."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled.", "AbortError"));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded);
    };
    const abort = () => xhr.abort();
    signal?.addEventListener("abort", abort, { once: true });
    xhr.onloadend = () => signal?.removeEventListener("abort", abort);
    xhr.send(blob);
  });
}

export async function uploadLargeFile(
  file: File,
  target: LargeUploadTarget,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<{ reference: string; uploadId: string; fileName: string; contentType: string }> {
  if (!usesR2Storage(file.size)) throw new Error("This file should use Supabase Storage.");
  const token = await accessToken();
  const init = await responseJson<{ uploadId: string; partSize: number; parts: PartTicket[] }>(
    await fetch("/api/storage/r2/uploads", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...target, fileName: file.name, contentType: file.type, size: file.size }),
      cache: "no-store",
      signal,
    }),
  );
  const uploaded: { partNumber: number; etag: string }[] = [];
  let doneBytes = 0;
  try {
    for (const part of init.parts) {
      if (signal?.aborted) throw new DOMException("Upload cancelled.", "AbortError");
      const start = (part.partNumber - 1) * init.partSize;
      const chunk = file.slice(start, Math.min(file.size, start + init.partSize));
      const etag = await putPart(part.url, chunk, signal, (loaded) => {
        onProgress?.(Math.min(99, Math.round(((doneBytes + loaded) / file.size) * 100)));
      });
      uploaded.push({ partNumber: part.partNumber, etag });
      doneBytes += chunk.size;
      onProgress?.(Math.min(100, Math.round((doneBytes / file.size) * 100)));
    }
    const completed = await responseJson<{ reference: string; fileName: string; contentType: string }>(await fetch("/api/storage/r2/uploads/complete", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId: init.uploadId, parts: uploaded }),
      cache: "no-store",
      signal,
    }));
    return { ...completed, uploadId: init.uploadId };
  } catch (error) {
    await fetch(`/api/storage/r2/uploads/${init.uploadId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).catch(() => undefined);
    throw error;
  }
}

export async function deleteUnusedLargeFile(uploadId: string): Promise<void> {
  const token = await accessToken();
  await responseJson(await fetch(`/api/storage/r2/uploads/${uploadId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }));
}

export async function getLargeFileUrl(
  purpose: "message" | "submission" | "dispute",
  recordId: string,
): Promise<string> {
  const token = await accessToken();
  const result = await responseJson<{ url: string }>(await fetch("/api/storage/r2/download", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ purpose, recordId }),
    cache: "no-store",
  }));
  return result.url;
}
