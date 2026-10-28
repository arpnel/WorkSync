"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, FileCheck2, Paperclip, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StyledSelect } from "@/components/ui/styled-select";
import { FileUpload } from "@/components/uploads/FileUpload";
import { SubmissionComments } from "./SubmissionComments";
import { SubmissionImage } from "./SubmissionImage";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";
import { readProjectCache, clearProjectReadCache } from "@/lib/projectReadCache";
import { reviewableDeliveryIds } from "@/lib/projectDelivery";
import {
  addProjectSubmissionComment,
  getDeliveryHistory,
  leaveProjectReview,
  openProjectAttachment,
  requestProjectSettlementReview,
  reviewSubmission,
  submitProjectWork,
  type WorkSubmission,
} from "@/services/project/projectDeliveryService";
import { supabase } from "@/lib/supabaseClient";

export function TaskSubmissionPanel({
  project,
  taskTitle,
  milestoneId,
  paid,
  onRefresh,
}: {
  project: ProjectWorkspace;
  taskTitle: string;
  milestoneId: string | null;
  paid: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getDeliveryHistory>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"delivery" | "progress">("delivery");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reviewing, setReviewing] = useState<{ submission: WorkSubmission; action: "approve" | "revision" } | null>(null);
  const [instructions, setInstructions] = useState("");
  const [rating, setRating] = useState("5");
  const [projectReviewComment, setProjectReviewComment] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const automaticRefresh = useRef("");
  const settlementRefresh = useRef("");

  const load = useCallback(async () => {
    if (!project.projectId) return;
    try {
      const result = await readProjectCache(`delivery:${project.projectId}`, () => getDeliveryHistory(project.projectId!), true);
      setHistory(result);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load task delivery history.");
    } finally {
      setLoading(false);
    }
  }, [project.projectId]);

  useEffect(() => {
    void load();
    if (!project.projectId) return;
    const channel = supabase.channel(`task-deliveries:${project.projectId}:${milestoneId ?? "project"}`);
    for (const table of ["project_submissions", "revision_requests", "project_submission_comments"])
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `project_id=eq.${project.projectId}` }, () => void load());
    channel.subscribe();
    window.addEventListener("focus", load);
    return () => {
      window.removeEventListener("focus", load);
      void supabase.removeChannel(channel);
    };
  }, [load, milestoneId, project.projectId]);

  useEffect(() => {
    const latest = (history?.submissions ?? [])
      .filter((submission) => submission.auto_reviewed_at)
      .map((submission) => submission.submission_id)
      .sort()
      .join(",");
    if (!latest || latest === automaticRefresh.current) return;
    automaticRefresh.current = latest;
    void onRefresh().catch(() => { automaticRefresh.current = ""; });
  }, [history, onRefresh]);

  useEffect(() => {
    if (!history || !project.projectId || project.currentParty !== "client" ||
      !["active", "in_progress", "revision"].includes(project.status.toLowerCase())) return;
    const approved = history.submissions
      .filter((submission) => submission.kind === "delivery" && submission.status === "approved")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (!approved.length) return;
    const latest = approved[approved.length - 1];
    const key = `${project.projectId}:${approved.map((item) => item.submission_id).sort().join(",")}`;
    if (key === settlementRefresh.current) return;
    settlementRefresh.current = key;
    void requestProjectSettlementReview(project.projectId, latest.submission_id)
      .then(async (outcome) => {
        if (outcome.status !== "completed") return;
        clearProjectReadCache();
        await load();
        await onRefresh();
      })
      .catch(() => { settlementRefresh.current = ""; });
  }, [history, load, onRefresh, project.currentParty, project.projectId, project.status]);

  const scoped = (history?.submissions ?? []).filter((submission) => submission.milestone_id === milestoneId);
  const scopedIds = new Set(scoped.map((submission) => submission.submission_id));
  const scopedRevisions = (history?.revisions ?? []).filter((revision) => scopedIds.has(revision.submission_id));
  const reviewable = reviewableDeliveryIds(scoped, project.milestones);
  const pending = scoped.some((submission) => submission.kind === "delivery" && reviewable.has(submission.submission_id));
  const active = ["active", "revision"].includes(project.status.toLowerCase());
  const remaining = project.revisions == null ? null : Math.max(0, project.revisions - (history?.revisions.length ?? 0));
  const currentMilestone = project.type === "milestone"
    ? [...project.milestones]
      .filter((item) => !["approved", "completed", "cancelled"].includes(item.status))
      .sort((a, b) => a.displayOrder - b.displayOrder)[0] ?? null
    : null;
  const canSubmit = project.currentParty === "freelancer" && active && paid &&
    (project.type !== "milestone" || currentMilestone?.id === milestoneId);
  const ownReview = history?.reviews.some((review) => review.reviewer_role === project.currentParty) ?? false;
  const projectReviewScope = project.type === "standard" || project.milestones.at(-1)?.id === milestoneId;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project.projectId || busy || !paid) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await submitProjectWork(project.projectId, milestoneId, body, link, kind, file ?? undefined);
      setBody("");
      setLink("");
      setFile(null);
      setComposerOpen(false);
      setNotice(kind === "delivery" ? "Work submitted for client review." : "Progress update shared.");
      clearProjectReadCache();
      await load();
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit work.");
    } finally {
      setBusy(false);
    }
  }

  async function decide() {
    if (!project.projectId || !reviewing || busy) return;
    setBusy(true);
    setError("");
    try {
      if (reviewing.action === "approve") {
        const approvedIds = (history?.submissions ?? [])
          .filter((submission) => submission.kind === "delivery" && submission.status === "approved")
          .map((submission) => submission.submission_id);
        if (!approvedIds.includes(reviewing.submission.submission_id)) approvedIds.push(reviewing.submission.submission_id);
        settlementRefresh.current = `${project.projectId}:${approvedIds.sort().join(",")}`;
      }
      const outcome = await reviewSubmission(project.projectId, reviewing.submission.submission_id, reviewing.action, instructions);
      setReviewing(null);
      setInstructions("");
      setNotice(reviewing.action === "revision"
        ? "Revision request sent."
        : outcome?.status === "completed"
          ? "Delivery approved and project completed."
          : outcome?.status === "disabled"
            ? "Delivery approved. Project settlement is disabled."
            : outcome?.status === "payment_unavailable"
              ? "Delivery approved. Settlement could not match a paid payment."
              : outcome?.status === "verification_failed" || outcome?.status === "request_failed"
                ? `Delivery approved. Settlement review needs attention${outcome.detail ? `: ${outcome.detail}` : "."}`
                : "Delivery approved. Project settlement review is processing.");
      clearProjectReadCache();
      await load();
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the review.");
    } finally {
      setBusy(false);
    }
  }

  async function addComment(submissionId: string, commentBody: string) {
    if (!project.projectId) throw new Error("Project not found.");
    await addProjectSubmissionComment(project.projectId, submissionId, commentBody);
    clearProjectReadCache();
    await load();
    await onRefresh();
  }

  if (!project.projectId) return null;
  return (
    <section aria-label={`Deliveries for ${taskTitle}`} className="space-y-3 rounded-lg border border-primary/20 bg-primary/[0.035] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1"><h3 className="text-base font-semibold">Task submissions</h3><p className="text-sm text-foreground/80">Submit completed work for “{taskTitle}” and review feedback.</p><p className="text-xs text-muted-foreground">{milestoneId ? "Existing submissions are milestone-level, not tagged with a task ID." : "Existing submissions are project-level, not tagged with a task ID."}</p>{project.currentParty === "freelancer" && active && <p className="text-xs font-medium text-muted-foreground">{remaining == null ? "Revision allowance unavailable" : `${remaining} project revisions remaining`}</p>}</div>
        {canSubmit && <Button type="button" onClick={() => setComposerOpen((open) => !open)} aria-expanded={composerOpen} className="shrink-0 shadow-sm"><Send className="mr-1.5 h-4 w-4"/>{composerOpen ? "Close form" : "Submit work"}</Button>}
      </div>
      {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-md border p-3 text-sm">{notice}</p>}
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading task deliveries…</p>}

      {canSubmit && composerOpen && <form onSubmit={(event) => void submit(event)} className="space-y-3 rounded-md border border-border/60 bg-background/70 p-3">
        <h4 className="text-sm font-medium">Submit work for “{taskTitle}”</h4>
        <label className="block text-sm">Submission type<StyledSelect className="mt-1 w-full rounded-md border bg-background p-2" value={kind} onChange={(event) => setKind(event.target.value as "delivery" | "progress")}><option value="delivery">Deliver work for approval</option><option value="progress">Progress update</option></StyledSelect></label>
        <label className="block text-sm">Submission note<Textarea maxLength={10000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Describe the work or progress for the client." /></label>
        <label className="block text-sm">Link (optional)<Input type="url" value={link} onChange={(event) => setLink(event.target.value)} /></label>
        <div className="space-y-1 text-sm"><p>Attachment (up to 1 GB)</p><FileUpload file={file} onFileSelect={setFile} onFileRemove={() => setFile(null)} onFileError={setError} accept="*/*" maxSizeBytes={1024 * 1024 * 1024} placeholder="Choose work to submit" className="[&>button]:!min-h-10 [&>button]:!flex-row [&>button]:!justify-start [&>button]:!gap-2 [&>button]:!p-3 [&>button>svg]:!size-4" /></div>
        {kind === "delivery" && pending && <p className="rounded-md border border-border/70 bg-muted/35 p-3 text-sm text-foreground/80">A delivery is awaiting review for this scope. Wait for approval or a revision request.</p>}
        <div className="flex flex-wrap items-center gap-2"><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setComposerOpen(false)}>Cancel</Button><Button disabled={busy || loading || !paid || (kind === "delivery" && pending) || (!body.trim() && !link.trim() && !file)}><Send className="mr-1.5 h-4 w-4" />{busy ? "Submitting..." : kind === "delivery" ? "Submit for review" : "Share progress update"}</Button></div>
      </form>}

      {!scoped.length && !loading && <div className="flex items-start gap-3 rounded-md border border-dashed border-border/70 bg-background/45 px-3 py-3"><span className="rounded-md bg-primary/10 p-2 text-primary"><Upload className="h-4 w-4"/></span><div className="min-w-0"><p className="text-sm font-medium">No submissions yet</p><p className="mt-0.5 text-xs text-muted-foreground">{canSubmit ? "Add your completed work and send it to the client for review." : `No submissions are recorded for this ${milestoneId ? "milestone" : "project"} scope yet.`}</p></div></div>}
      <ol className="divide-y divide-border/60">
        {[...scoped].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((submission) => {
          const submissionTitle = submission.attachment_name || submission.body.split("\n")[0]?.trim() || (submission.kind === "delivery" ? "Work delivery" : "Progress update");
          return <li key={submission.submission_id} className="py-2.5">
            <details className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex min-w-0 items-center gap-2"><FileCheck2 className="h-4 w-4 shrink-0 text-primary"/><span className="min-w-0"><span className="block truncate text-sm font-medium">{submissionTitle}</span><span className="text-xs text-muted-foreground">{new Date(submission.created_at).toLocaleDateString()} · {submission.kind === "delivery" ? "Delivery" : "Progress update"} · {milestoneId ? "Milestone-level" : "Project-level"}</span></span></span>
                <span className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-muted px-2 py-1 text-xs capitalize">{submission.auto_reviewed_at ? "Automatically approved" : submission.status.replaceAll("_", " ")}</span><ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"/></span>
              </summary>
              <div className="space-y-3 px-2 pb-2 pt-3">
                <time className="block text-xs text-muted-foreground">Submitted {new Date(submission.created_at).toLocaleString()}</time>
                {submission.body && <p className="whitespace-pre-wrap text-sm">{submission.body}</p>}
                {submission.link && /^https?:\/\//i.test(submission.link) && <a href={submission.link} target="_blank" rel="noopener noreferrer" className="break-all text-sm underline">Open submitted link</a>}
                {submission.attachment_path && <div className="space-y-2"><SubmissionImage path={submission.attachment_path} name={submission.attachment_name ?? "Submitted work"} submissionId={submission.submission_id} /><Button type="button" variant="outline" size="sm" onClick={() => void openProjectAttachment(submission.attachment_path!, "submission", submission.submission_id).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to open attachment."))}><Paperclip className="mr-1.5 h-4 w-4" />{submission.attachment_name ?? "Open attachment"}</Button></div>}
                {scopedRevisions.filter((revision) => revision.submission_id === submission.submission_id).map((revision) => <div key={revision.revision_id} className="rounded-md bg-muted/40 p-3 text-sm"><p className="font-medium">Changes requested</p><p className="mt-1 whitespace-pre-wrap">{revision.instructions}</p><time className="mt-1 block text-xs text-muted-foreground">{new Date(revision.created_at).toLocaleString()}</time></div>)}
                {active && project.currentParty === "client" && submission.kind === "delivery" && reviewable.has(submission.submission_id) && <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => setReviewing({ submission, action: "approve" })}>Approve delivery</Button><Button size="sm" variant="outline" disabled={busy || !remaining} onClick={() => { setInstructions(""); setReviewing({ submission, action: "revision" }); }}>Request revision</Button></div>}
                <SubmissionComments comments={history?.comments ?? []} projectId={project.projectId ?? ""} submissionId={submission.submission_id} currentUserId={project.currentUserId} otherParty={project.currentParty === "client" ? "Freelancer" : "Client"} readOnly={project.status.toLowerCase() === "cancelled"} busy={busy} onAdd={async (_projectId, submissionId, commentBody) => addComment(submissionId, commentBody)} />
              </div>
            </details>
          </li>;
        })}
      </ol>

      {project.status.toLowerCase() === "completed" && projectReviewScope && history && !ownReview && <form className="space-y-3 border-t pt-4" onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        void leaveProjectReview(project.projectId!, Number(rating), projectReviewComment)
          .then(async () => {
            setNotice("Project review published.");
            clearProjectReadCache();
            await load();
            await onRefresh();
          })
          .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to publish review."))
          .finally(() => setBusy(false));
      }}>
        <h4 className="text-sm font-semibold">Review this project</h4>
        <label className="block text-sm">Rating<StyledSelect className="ml-2 rounded-md border bg-background p-2" value={rating} onChange={(event) => setRating(event.target.value)}>{[5, 4, 3, 2, 1].map((score) => <option key={score} value={score}>{score} stars</option>)}</StyledSelect></label>
        <label className="block text-sm">Comment<Textarea maxLength={5000} value={projectReviewComment} onChange={(event) => setProjectReviewComment(event.target.value)} /></label>
        <Button disabled={busy}>Publish review</Button>
      </form>}
      {projectReviewScope && history?.reviews.map((review) => <div key={review.review_id} className="border-t pt-3 text-sm"><strong className="capitalize">{review.reviewer_role} review · {review.rating}/5</strong><p>{review.comment}</p></div>)}

      <Dialog open={!!reviewing} onOpenChange={(open) => { if (!open && !busy) setReviewing(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{reviewing?.action === "approve" ? "Approve this delivery?" : "Request a revision"}</DialogTitle><DialogDescription>{reviewing?.action === "approve" ? "Approval uses the existing WorkSync review and settlement rules." : "Describe changes within the agreed scope. The existing revision allowance applies."}</DialogDescription></DialogHeader>
          {reviewing?.action === "revision" && <label className="text-sm">Changes requested<Textarea maxLength={5000} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>}
          <Button disabled={busy || (reviewing?.action === "revision" && (!instructions.trim() || !remaining))} onClick={() => void decide()}>{busy ? "Saving…" : reviewing?.action === "approve" ? "Confirm approval" : "Send revision request"}</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
