"use client";

import { useEffect, useState } from "react";
import { readPageCache, invalidatePageReads } from "@/lib/pageReadCache";
import { supabase } from "@/lib/supabaseClient";
import { DocumentPreview } from "./DocumentPreview";
import { DocumentsEditor } from "./DocumentsEditor";
import { Button } from "@/components/ui/button";

type Document = { label: string; path: string; bucket: string };

/** Owner-only supporting files; these are separate from published portfolio projects. */
export function SetupDocuments({
  userId,
  editable = false,
}: {
  userId: string;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setError("");
        const data = await readPageCache(
          "supporting-documents:" + userId,
          async () => {
            const result = await supabase
              .from("freelancer_profiles")
              .select("resume_url,portfolio_sample_urls,certification_urls")
              .eq("user_id", userId)
              .maybeSingle();
            if (result.error) throw new Error(result.error.message);
            return result.data;
          },
        );
        if (!active) return;
        setDocuments([
          ...(data?.resume_url
            ? [
                {
                  label: "Resume / CV",
                  path: data.resume_url,
                  bucket: "verification-documents",
                },
              ]
            : []),
          ...(data?.portfolio_sample_urls ?? []).map(
            (path: string, index: number) => ({
              label: `Portfolio sample ${index + 1}`,
              path,
              bucket: "verification-documents",
            }),
          ),
          ...(data?.certification_urls ?? []).map(
            (path: string, index: number) => ({
              label: `Certification ${index + 1}`,
              path,
              bucket: "verification-documents",
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
  }, [userId, revision]);

  return (
    <section className="space-y-4">
      {editing && (
        <DocumentsEditor
          userId={userId}
          documents={documents}
          onClose={() => setEditing(false)}
          onSaved={() => {
            invalidatePageReads();
            setEditing(false);
            setRevision((value) => value + 1);
          }}
        />
      )}
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Your setup documents</h2>
          {editable && (
            <Button
              size="sm"
              variant="outline"
              disabled={loading || !!error}
              onClick={() => setEditing(true)}
            >
              Edit documents
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Supporting files saved during setup. Publish portfolio projects
          separately in the Portfolio tab.
        </p>
      </div>
      <div className="space-y-4">
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
          <div className="space-y-4">
            {(
              [
                {
                  title: "CV / Resume",
                  match: (document: Document) =>
                    document.label === "Resume / CV",
                },
                {
                  title: "Portfolio",
                  match: (document: Document) =>
                    document.label.startsWith("Portfolio"),
                },
                {
                  title: "Certifications",
                  match: (document: Document) =>
                    document.label.startsWith("Certification"),
                },
              ] as const
            ).map((group) => {
              const files = documents.filter(group.match);
              return (
                <section key={group.title} className="space-y-2 border-t pt-4">
                  <h3 className="text-sm font-semibold">{group.title}</h3>
                  {files.length ? (
                    <div className="space-y-3">
                      {files.map((document) => (
                        <DocumentPreview
                          key={`${document.bucket}/${document.path}`}
                          {...document}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No {group.title.toLowerCase()} uploaded.
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        )}
        {!loading && !error && !documents.length && (
          <p className="text-sm text-muted-foreground">
            No supporting files saved.
          </p>
        )}
      </div>
    </section>
  );
}
