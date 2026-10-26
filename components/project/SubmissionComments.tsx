"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectSubmissionComment } from "@/services/project/projectDeliveryService";

export function SubmissionComments({
  comments,
  projectId,
  submissionId,
  currentUserId,
  otherParty,
  readOnly = false,
  busy,
  onAdd,
}: {
  comments: ProjectSubmissionComment[];
  projectId: string;
  submissionId: string;
  currentUserId: string;
  otherParty: "Client" | "Freelancer";
  readOnly?: boolean;
  busy: boolean;
  onAdd: (
    projectId: string,
    submissionId: string,
    body: string,
  ) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const thread = comments.filter(
    (comment) => comment.submission_id === submissionId,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setError("");
    try {
      await onAdd(projectId, submissionId, body);
      setBody("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to add comment.",
      );
    }
  }

  return (
    <section
      className="space-y-3 border-t pt-3"
      aria-label="Submission comments"
    >
      <h3 className="text-sm font-medium">Comments ({thread.length})</h3>
      {thread.map((comment) => {
        const author = comment.author_id === currentUserId ? "You" : otherParty;
        return (
          <article
            key={comment.comment_id}
            className="rounded-md bg-muted/40 p-3 text-sm"
          >
            <div className="flex justify-between gap-3">
              <strong>{author}</strong>
              <time className="text-xs text-muted-foreground">
                {new Date(comment.created_at).toLocaleString()}
              </time>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words">
              {comment.body}
            </p>
          </article>
        );
      })}
      {!readOnly && (
        <form onSubmit={(event) => void submit(event)} className="space-y-2">
          <Textarea
            aria-label="Add a comment to this submission"
            placeholder="Add a comment about this submission"
            maxLength={2000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button size="sm" variant="outline" disabled={busy || !body.trim()}>
            {busy ? "Saving…" : "Comment"}
          </Button>
        </form>
      )}
    </section>
  );
}
