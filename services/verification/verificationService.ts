import { supabase } from "@/lib/supabaseClient";
import {
  IDENTITY_IMAGE_MAX_BYTES,
  identityImageFormat,
} from "./identityImage";

export type VerificationStatus = {
  status: "not_submitted" | "pending" | "verified" | "rejected";
  verified: boolean;
  canSubmit: boolean;
  rejectionReason: string | null;
  reverificationReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
};

async function api<T>(method: "GET" | "POST", body?: unknown): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to verify your identity.");
  const response = await fetch("/api/verify", {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(result?.error || "Verification could not be loaded.");
  return result as T;
}

export function getIdentityVerification() {
  return api<VerificationStatus>("GET");
}

export async function submitIdentityVerification(input: {
  front: File;
  back: File | null;
  selfie: File;
  idNumber: string;
}) {
  const files = [
    { slot: "front", file: input.front },
    ...(input.back ? [{ slot: "back", file: input.back }] : []),
    { slot: "selfie", file: input.selfie },
  ];
  if (files.some(({ file }) => file.size > IDENTITY_IMAGE_MAX_BYTES))
    throw new Error("Each image must be 5 MB or smaller.");
  const metadata = files.map(({ slot, file }) => ({
    slot,
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  }));
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to verify your identity.");
  const headers = {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
  const preparedResponse = await fetch("/api/verify/uploads", {
    method: "POST",
    headers,
    body: JSON.stringify({ files: metadata }),
    cache: "no-store",
  });
  const prepared = await preparedResponse.json().catch(() => null);
  if (!preparedResponse.ok)
    throw new Error(prepared?.error || "Secure image upload could not be prepared.");

  const uploadedPaths: Record<string, string> = {};
  try {
    await Promise.all(
      files.map(async ({ slot, file }) => {
        const format = identityImageFormat(file.name, file.type);
        const target = prepared.uploads.find(
          (item: { slot: string }) => item.slot === slot,
        );
        if (!target) throw new Error("A secure upload link is missing.");
        const result = await supabase.storage
          .from("verification-documents")
          .uploadToSignedUrl(target.path, target.token, file, {
            contentType: format.contentType,
            upsert: false,
          });
        if (result.error) throw new Error("An image could not be uploaded. Please try again.");
        uploadedPaths[slot] = target.path;
      }),
    );
    return await api<{ submitted: true }>("POST", {
      requestId: prepared.requestId,
      idFrontPath: uploadedPaths.front,
      idBackPath: uploadedPaths.back ?? null,
      selfiePath: uploadedPaths.selfie,
      idNumber: input.idNumber.trim() || null,
    });
  } catch (error) {
    if (Object.values(uploadedPaths).length)
      await supabase.storage
        .from("verification-documents")
        .remove(Object.values(uploadedPaths));
    throw error;
  }
}
