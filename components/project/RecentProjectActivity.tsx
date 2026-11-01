"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, MessageSquare, RotateCcw, UploadCloud } from "lucide-react";
import { readProjectCache } from "@/lib/projectReadCache";
import { subscribeToProjectActivityChanges } from "@/lib/projectRealtime";
import { getDeliveryHistory } from "@/services/project/projectDeliveryService";
import { loadProjectTaskHistory } from "@/services/project/projectTaskService";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";

type ActivityEntry = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  actor: string;
  kind: "delivery" | "progress" | "comment" | "revision" | "task";
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
  if (kind === "task") return CheckCircle2;
  return RotateCcw;
}

export function RecentProjectActivity({ project }: { project: ProjectWorkspace }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!project.projectId) return;
    try {
      const [history, taskHistory] = await Promise.all([
        readProjectCache(
          `delivery:${project.projectId}`,
          () => getDeliveryHistory(project.projectId!),
        ),
        loadProjectTaskHistory(project.projectId),
      ]);
      const submissionById = new Map(history.submissions.map((submission) => [submission.submission_id, submission]));
      const actorName = (actorId: string | null) => actorId === project.currentUserId
        ? (project.currentParty === "client" ? project.clientName : project.freelancerName)
        : (project.currentParty === "client" ? project.freelancerName : project.clientName);
      const statusLabel: Record<string, string> = {
        todo: "To Do",
        in_progress: "In Progress",
        in_review: "In Review",
        revision_requested: "Revision Requested",
        auto_approved: "Auto Approved",
        completed: "Completed",
      };
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
        ...taskHistory.map((entry) => {
          const from = entry.from_status ? statusLabel[entry.from_status] ?? entry.from_status : "the previous stage";
          const to = statusLabel[entry.to_status] ?? entry.to_status;
          return {
            id: `task:${entry.history_id}`,
            title: to === "In Progress" ? "Task moved to In Progress" : `Task moved to ${to}`,
            description: `“${entry.task_title}” moved from ${from} to ${to}.${entry.note ? ` ${entry.note}` : ""}`,
            createdAt: entry.created_at,
            actor: actorName(entry.actor_id),
            kind: "task" as const,
          };
        }),
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
    void load();
    const unsubscribeActivity = subscribeToProjectActivityChanges(project.projectId, () => void load());
    return () => {
      unsubscribeActivity();
    };
  }, [load, project.projectId]);

  return (
    <section aria-labelledby="recent-project-activity-title" className="flex h-[280px] min-h-0 flex-col rounded-xl border bg-card p-4 sm:p-5">
      <h2 id="recent-project-activity-title" className="shrink-0 text-base font-semibold">Recent activity</h2>
      {loading ? <p role="status" className="mt-4 flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">Loading recent activity…</p>
        : error ? <p role="alert" className="mt-4 flex min-h-0 flex-1 items-center text-sm text-destructive">{error}</p>
          : entries.length === 0 ? <div className="mt-4 flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-5 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary"><Activity className="size-5" /></span>
            <h3 className="mt-3 text-sm font-semibold">Nothing happening yet</h3>
            <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Task status changes, deliveries, progress updates, comments, and change requests will show up here.</p>
          </div>
            : <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              <ol className="divide-y divide-border border-b border-border">
              {entries.map((entry) => {
                const Icon = iconFor(entry.kind);
                return <li key={entry.id} className="flex gap-3 py-4 first:pt-0 last:pb-4">
                  <span className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full ${entry.kind === "delivery" ? "bg-violet-500/15 text-violet-500" : entry.kind === "comment" ? "bg-blue-500/15 text-blue-500" : entry.kind === "revision" ? "bg-amber-500/15 text-amber-600" : "bg-primary/15 text-primary"}`}><Icon className="size-4" /></span>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium">{entry.title}</h3><time dateTime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString()} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{relativeTime(entry.createdAt)}</time></div>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.actor}{entry.kind === "comment" ? " commented" : entry.kind === "revision" ? " requested changes" : entry.kind === "delivery" ? " submitted work" : entry.kind === "task" ? " updated task progress" : " shared an update"}</p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">{entry.description}</p>
                  </div>
                </li>;
              })}
              </ol>
            </div>}
    </section>
  );
}
