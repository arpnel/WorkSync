"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Document = { label: string; path: string; bucket: string };

/** Owner-only supporting files; these are separate from published portfolio projects. */
export function SetupDocuments({ userId }: { userId: string }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data, error } = await supabase
          .from("freelancer_profiles")
          .select("resume_url,portfolio_sample_urls,certification_urls")
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!active) return;
        setDocuments([
          ...(data?.resume_url
            ? [
                {
                  label: "Resume / CV",
                  path: data.resume_url,
                  bucket: "resumes",
                },
              ]
            : []),
          ...(data?.portfolio_sample_urls ?? []).map(
            (path: string, index: number) => ({
              label: `Portfolio sample ${index + 1}`,
              path,
              bucket: "verification",
            }),
          ),
          ...(data?.certification_urls ?? []).map(
            (path: string, index: number) => ({
              label: `Certification ${index + 1}`,
              path,
              bucket: "verification",
            }),
          ),
        ]);
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load supporting files.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [userId]);

  async function open(document: Document) {
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      setError("Allow a new tab to open this document.");
      return;
    }
    tab.opener = null;
    try {
      setError("");
      // Setup stores private paths. Let Storage authorize each signed URL.
      const { data, error } = await supabase.storage
        .from(document.bucket)
        .createSignedUrl(document.path, 60);
      if (error) throw new Error(error.message);
      tab.location.replace(data.signedUrl);
    } catch (cause) {
      tab.close();
      setError(
        cause instanceof Error ? cause.message : "Unable to open this file.",
      );
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your setup documents</CardTitle>
        <p className="text-sm text-muted-foreground">
          Supporting files saved during setup. Publish portfolio projects
          separately in the Portfolio tab.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading documents…
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {documents.map((document) => (
              <Button
                key={`${document.bucket}/${document.path}`}
                variant="outline"
                onClick={() => void open(document)}
              >
                {document.label}
              </Button>
            ))}
          </div>
        )}
        {!loading && !error && !documents.length && (
          <p className="text-sm text-muted-foreground">
            No supporting files saved.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
