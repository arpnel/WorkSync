"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, MessageSquare, RotateCcw, UploadCloud } from "lucide-react";
import { readProjectCache } from "@/lib/projectReadCache";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { getDeliveryHistory } from "@/services/project/projectDeliveryService";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";

type ActivityEntry = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  actor: string;
  kind: "delivery" | "progress" | "comment" | "revision";
};

function relativeTime(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed)) return "";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function iconFor(kind: ActivityEntry["kind"]) {
  if (kind === "delivery") return UploadCloud;
  if (kind === "progress") return Activity;
  if (kind === "comment") return MessageSquare;
  return RotateCcw;
}

export function RecentProjectActivity({ project }: { project: ProjectWorkspace }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!project.projectId) return;
    try {
      const history = await readProjectCache(
        `delivery:${project.projectId}`,
        () => getDeliveryHistory(project.projectId!),
        true,
      );
      const submissionById = new Map(history.submissions.map((submission) => [submission.submission_id, submission]));
      const events: ActivityEntry[] = [
        ...history.submissions.map((submission) => ({
          id: `submission:${submission.submission_id}`,
          title: submission.kind === "delivery" ? "Delivery submitted" : "Progress update",
          description: submission.body || (submission.attachment_name ? `Attached ${submission.attachment_name}` : "Project work submitted for review."),
          createdAt: submission.created_at,
          actor: submission.author_id === project.currentUserId
            ? (project.currentParty === "client" ? project.clientName : project.freelancerName)
            : (project.currentParty === "client" ? project.freelancerName : project.clientName),
          kind: submission.kind,
        })),
        ...history.comments.map((comment) => {
          const submission = submissionById.get(comment.submission_id);
          return {
            id: `comment:${comment.comment_id}`,
            title: "New comment",
            description: `${submission?.kind === "delivery" ? "Commented on delivery" : "Commented on progress update"}: ${comment.body}`,
            createdAt: comment.created_at,
            actor: comment.author_id === project.currentUserId
              ? (project.currentParty === "client" ? project.clientName : project.freelancerName)
              : (project.currentParty === "client" ? project.freelancerName : project.clientName),
            kind: "comment" as const,
          };
        }),
        ...history.revisions.map((revision) => ({
          id: `revision:${revision.revision_id}`,
          title: "Changes requested",
          description: revision.instructions,
          createdAt: revision.created_at,
          actor: project.clientName,
          kind: "revision" as const,
        })),
      ];
      setEntries(events.filter((event) => Number.isFinite(Date.parse(event.createdAt))).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load recent project activity.");
    } finally {
      setLoading(false);
    }
  }, [project.clientName, project.currentParty, project.currentUserId, project.freelancerName, project.projectId]);

  useEffect(() => {
    if (!project.projectId) {
      setLoading(false);
      return;
    }
    const initialLoad = window.setTimeout(() => void load(), 0);
    const channel = supabase.channel(`project-activity:${project.projectId}`);
    for (const table of ["project_submissions", "project_submission_comments", "revision_requests"]) {
      channel.on("postgres_changes", {
        event: "*",
        schema: "public",
        table,
        filter: `project_id=eq.${project.projectId}`,
      }, () => void load());
    }
    channel.subscribe();
    window.addEventListener("focus", load);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("focus", load);
      void supabase.removeChannel(channel);
    };
  }, [load, project.projectId]);

  const visibleEntries = showAll ? entries : entries.slice(0, 4);

  return (
    <section aria-labelledby="recent-project-activity-title" className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 id="recent-project-activity-title" className="text-base font-semibold">Recent activity</h2>
      {loading ? <p role="status" className="mt-4 text-sm text-muted-foreground">Loading recent activity…</p>
        : error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>
          : entries.length === 0 ? <div className="mt-4 flex flex-col items-center rounded-lg border border-dashed bg-muted/20 px-5 py-8 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary"><Activity className="size-5" /></span>
            <h3 className="mt-3 text-sm font-semibold">Nothing happening yet</h3>
            <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">New deliveries, progress updates, comments, and change requests will show up here.</p>
          </div>
            : <>
              <ol className="mt-4 space-y-4">
              {visibleEntries.map((entry, index) => {
                const Icon = iconFor(entry.kind);
                return <li key={entry.id} className="relative flex gap-3">
                  {index < visibleEntries.length - 1 && <span aria-hidden="true" className="absolute bottom-[-1rem] left-[15px] top-8 w-px bg-border" />}
                  <span className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full ${entry.kind === "delivery" ? "bg-violet-500/15 text-violet-500" : entry.kind === "comment" ? "bg-blue-500/15 text-blue-500" : entry.kind === "revision" ? "bg-amber-500/15 text-amber-600" : "bg-primary/15 text-primary"}`}><Icon className="size-4" /></span>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium">{entry.title}</h3><time dateTime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString()} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{relativeTime(entry.createdAt)}</time></div>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.actor}{entry.kind === "comment" ? " commented" : entry.kind === "revision" ? " requested changes" : entry.kind === "delivery" ? " submitted work" : " shared an update"}</p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">{entry.description}</p>
                  </div>
                </li>;
              })}
              </ol>
              {entries.length > 4 && <Button type="button" variant="outline" className="mt-4 w-full" onClick={() => setShowAll((visible) => !visible)}>{showAll ? "Show less" : "View all activity"}</Button>}
            </>}
    </section>
  );
}
