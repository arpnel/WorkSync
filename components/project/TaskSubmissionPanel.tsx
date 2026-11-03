"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { CheckCircle2, ChevronDown, FileCheck2, Loader2, LockKeyhole, Paperclip, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StyledSelect } from "@/components/ui/styled-select";
import { SubmissionComments } from "./SubmissionComments";
import { SubmissionImage } from "./SubmissionImage";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";
import type { ProjectPayment } from "@/services/payments/paymentService";
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
import { notifyProjectActivityChanged, subscribeToProjectActivityChanges } from "@/lib/projectRealtime";

export function TaskSubmissionPanel({
  project,
  taskTitle,
  milestoneId,
  milestoneAmount,
  milestoneNumber,
  embedded = false,
  paid,
  payment,
  onRefresh,
}: {
  project: ProjectWorkspace;
  taskTitle: string;
  milestoneId: string | null;
  milestoneAmount?: number;
  milestoneNumber?: number;
  embedded?: boolean;
  paid: boolean;
  payment: ProjectPayment | null;
  onRefresh: () => Promise<void>;
}) {
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getDeliveryHistory>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<{ submission: WorkSubmission; action: "approve" | "revision" } | null>(null);
  const [instructions, setInstructions] = useState("");
  const [rating, setRating] = useState("5");
  const [projectReviewComment, setProjectReviewComment] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const automaticRefresh = useRef("");
  const settlementRefresh = useRef("");

  const load = useCallback(async () => {
    if (!project.projectId) return;
    try {
      const result = await readProjectCache(`delivery:${project.projectId}`, () => getDeliveryHistory(project.projectId!));
      setHistory(result);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load task delivery history.");
    } finally {
      setLoading(false);
    }
  }, [project.projectId]);

  useEffect(() => {
    if (!project.projectId) return;
    void load();
    return subscribeToProjectActivityChanges(project.projectId, () => void load());
  }, [load, project.projectId]);

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
  const milestoneRecord = milestoneId ? project.milestones.find((item) => item.id === milestoneId) : null;
  const milestoneComplete = milestoneRecord ? ["approved", "completed"].includes(milestoneRecord.status) : false;
  const milestoneLocked = Boolean(
    milestoneId && project.type === "milestone" && currentMilestone &&
    currentMilestone.id !== milestoneId && !milestoneComplete,
  );
  const canSubmit = project.currentParty === "freelancer" && active && paid &&
    (project.type !== "milestone" || currentMilestone?.id === milestoneId);
  const ownReview = history?.reviews.some((review) => review.reviewer_role === project.currentParty) ?? false;
  const projectReviewScope = project.type === "standard" || project.milestones.at(-1)?.id === milestoneId;
  const milestonePayout = milestoneId
    ? payment?.payouts?.find((payout) => payout.milestone_id === milestoneId) ?? null
    : null;
  const payoutStatusLabel: Record<string, string> = {
    awaiting_account: "Payout account needed",
    ready: "Ready for payout",
    processing: "Payout processing",
    pending: "Payout pending",
    paid: "Paid",
    failed: "Payout failed",
    needs_review: "Payout under review",
    cancelled: "Payout cancelled",
  };

  async function submitFile(selectedFile: File) {
    if (!project.projectId || busy || !paid) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await submitProjectWork(project.projectId, milestoneId, "", "", "delivery", selectedFile);
      setNotice("Work submitted for client review.");
      clearProjectReadCache();
      notifyProjectActivityChanged(project.projectId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit work.");
    } finally {
      setBusy(false);
    }
  }

  function onFileDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    const selectedFile = event.dataTransfer.files[0];
    if (selectedFile) void submitFile(selectedFile);
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
      notifyProjectActivityChanged(project.projectId);
      if (reviewing.action === "approve") await onRefresh();
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
    notifyProjectActivityChanged(project.projectId);
  }

  if (!project.projectId) return null;
  return (
    <section aria-label={`Work submissions for ${taskTitle}`} className={embedded ? `space-y-3 rounded-md px-3 py-4 first:pt-2 last:pb-2 ${milestoneLocked ? "bg-muted/20 opacity-50" : milestoneComplete ? "bg-emerald-500/5" : "bg-primary/5"}` : "space-y-3 rounded-xl border bg-card p-4 sm:p-5"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1"><h3 className="flex items-center gap-2 text-base font-semibold">{milestoneId ? `Milestone ${milestoneNumber ?? ""}: ${taskTitle}` : "Work submissions"}{milestoneComplete && <CheckCircle2 aria-label="Milestone approved" className="size-4 text-emerald-600"/>}{milestoneLocked && <LockKeyhole aria-label="Milestone locked" className="size-4 text-muted-foreground"/>}</h3>{milestoneId && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>Amount: PHP {(milestoneAmount ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>{payment?.settlementVersion && payment.settlementVersion >= 2 && milestonePayout && <span>{payoutStatusLabel[milestonePayout.status] ?? "Payout status unavailable"} · PHP {milestonePayout.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>}</div>}<p className="text-sm font-medium text-foreground/80">Submission</p>{project.currentParty === "freelancer" && active && <p className="text-xs font-medium text-muted-foreground">{remaining == null ? "Revision allowance unavailable" : `${remaining} project revisions remaining`}</p>}</div>
      </div>
      {milestoneLocked && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-3.5 shrink-0"/>Complete and get approval for the previous milestone to unlock this one. Milestones must be completed in order; you cannot skip ahead.</p>}
      {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-md border p-3 text-sm">{notice}</p>}
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading task deliveries…</p>}


      {!loading && canSubmit && (
          <div>
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              onChange={(event) => {
                const selectedFile = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (selectedFile) void submitFile(selectedFile);
              }}
            />
            <button
              type="button"
              disabled={busy || pending}
              onClick={() => fileInput.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
              onDrop={onFileDrop}
              className={`flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-4 text-left transition-colors ${dragging ? "border-primary bg-primary/10" : "bg-muted/20 hover:bg-muted/40"} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <span className="rounded-md bg-primary/10 p-2 text-primary">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{busy ? "Uploading and submitting work…" : pending ? "Delivery awaiting client review" : scoped.length ? "Submit work for review" : "No submissions yet"}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{busy ? "Your file is being sent to the client for review." : pending ? "Wait for the client to approve this delivery or request a revision." : "Drop your completed work here or click to choose a file. It will be sent to the client for review."}</span>
              </span>
            </button>
          </div>
      )}
      {!scoped.length && !loading && !canSubmit && (
          <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/20 px-3 py-3">
            <span className="rounded-md bg-primary/10 p-2 text-primary"><Upload className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{milestoneLocked ? "Submission locked" : "No submissions yet"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{milestoneLocked ? "Finish the earlier milestone before submitting work here." : `No submissions are recorded for this ${milestoneId ? "milestone" : "project"} scope yet.`}</p>
            </div>
          </div>
      )}
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
                {submission.attachment_path && <div className="space-y-2"><SubmissionImage path={submission.attachment_path} name={submission.attachment_name ?? "Submitted work"} submissionId={submission.submission_id} /><Button type="button" variant="outline" size="sm" onClick={() => void openProjectAttachment(submission.attachment_path!).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to open attachment."))}><Paperclip className="mr-1.5 h-4 w-4" />{submission.attachment_name ?? "Open attachment"}</Button></div>}
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
      {project.currentParty === "freelancer" && active && !paid && (
        <p className="border-t pt-3 text-center text-sm font-medium text-amber-600">
          Client payment is required before you can submit work.
        </p>
      )}
    </section>
  );
}
