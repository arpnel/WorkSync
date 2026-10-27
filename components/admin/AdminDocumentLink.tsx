"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Source = "tax_document" | "tax_declaration" | "seller_submission" | "verification_request";

export default function AdminDocumentLink({
  source,
  recordId,
  path,
  className = "text-sm text-primary underline",
  children = "Open private document",
}: {
  source: Source;
  recordId: string;
  path?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [error, setError] = useState("");

  async function openDocument() {
    setError("");
    const viewer = window.open("about:blank", "_blank");
    if (!viewer) {
      setError("Allow pop-ups to open this private document.");
      return;
    }
    viewer.opener = null;
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (sessionError || !token) throw new Error("Your administrator session has expired. Sign in again.");
      const response = await fetch("/api/admin/document-url", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ source, recordId, path }),
      });
      const result = await response.json().catch(() => null) as { url?: string; error?: string } | null;
      if (!response.ok || !result?.url) throw new Error(result?.error || "Unable to open this document.");
      viewer.location.replace(result.url);
    } catch (cause) {
      viewer.close();
      setError(cause instanceof Error ? cause.message : "Unable to open this document.");
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className={className} onClick={() => void openDocument()}>
        {children}
      </button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
