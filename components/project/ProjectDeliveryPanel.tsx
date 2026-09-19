"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  readProjectCache,
  clearProjectReadCache,
} from "@/lib/projectReadCache";
import { projectProgress } from "@/lib/projectProgress";
import { reviewableDeliveryIds } from "@/lib/projectDelivery";
import { Plus, X } from "lucide-react";
import { SubmissionImage } from "./SubmissionImage";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";
import {
  getDeliveryHistory,
  submitProjectWork,
  openProjectAttachment,
  reviewSubmission,
  leaveProjectReview,
  type WorkSubmission,
} from "@/services/project/projectDeliveryService";
export function ProjectDeliveryPanel({
  project,
  onRefresh,
  paid = false,
  actions,
}: {
  project: ProjectWorkspace;
  onRefresh: () => Promise<void>;
  paid?: boolean;
  actions?: ReactNode;
}) {
  const [history, setHistory] = useState<Awaited<
    ReturnType<typeof getDeliveryHistory>
  > | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [kind, setKind] = useState<"progress" | "delivery">("delivery");
  const [milestone, setMilestone] = useState("");
  const [file, setFile] = useState<File>();
  const [uploadKey, setUploadKey] = useState(0);
  const [reviewing, setReviewing] = useState<{
    submission: WorkSubmission;
    action: "approve" | "revision";
  } | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [instructions, setInstructions] = useState("");
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const loadVersion = useRef(0);
  const load = useCallback(
    async (force = true) => {
      if (!project.projectId) return;
      const request = ++loadVersion.current;
      try {
        const projectId = project.projectId;
        const fresh = await readProjectCache(
          `delivery:${projectId}`,
          () => getDeliveryHistory(projectId),
          force,
        );
        if (request === loadVersion.current) {
          setHistory(fresh);
          setError("");
        }
      } catch (cause) {
        if (request !== loadVersion.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load delivery history.",
        );
      }
    },
    [project.projectId],
  );
  useEffect(() => {
    void load(false);
    const refresh = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      // Invalidate the latest request, including one started by polling.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++loadVersion.current;
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    if (!project.projectId) return;
    const channel = supabase.channel("deliveries:" + project.projectId);
    for (const table of ["project_submissions", "revision_requests", "reviews"])
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: "project_id=eq." + project.projectId,
        },
        () => void load(),
      );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, project.projectId]);
  async function act(operation: () => Promise<void>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      clearProjectReadCache();
      setNotice(message);
      await load();
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  if (!project.projectId) return null;
  const projectId = project.projectId;
  const active = ["active", "revision"].includes(project.status.toLowerCase());
  const remaining =
    history && project.revisions != null
      ? Math.max(0, project.revisions - history.revisions.length)
      : null;
  const completed = project.status.toLowerCase() === "completed";
  const reviewable = reviewableDeliveryIds(
    history?.submissions ?? [],
    project.milestones,
  );
  const pendingDelivery = (history?.submissions ?? []).some(
    (submission) =>
      reviewable.has(submission.submission_id) &&
      submission.milestone_id === (milestone || null),
  );
  const progress = projectProgress({
    completed,
    milestone: project.type === "milestone",
    milestones: project.milestones,
    submissions: history?.submissions,
  });
  const ownReview = history?.reviews.some(
    (review) => review.reviewer_role === project.currentParty,
  );
  return (
    <div className="space-y-5">
      <section
        className="space-y-2 rounded-lg bg-muted/30 p-4"
        aria-label="Project progress"
      >
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {completed
              ? "Completed"
              : project.type === "milestone"
                ? "Client-approved milestones"
                : "Work activity"}
          </span>
          <strong>{progress}%</strong>
        </div>
        <div
          role="progressbar"
          aria-label="Project progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: progress + "%" }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {completed
            ? "The client approved the final delivery."
            : project.type === "milestone"
              ? project.milestones.filter((m) => m.status === "approved")
                  .length +
                " of " +
                project.milestones.length +
                " milestones approved. Each milestone has equal weight."
              : "Each saved progress update adds 10%, up to 90%. This shows activity; one client approval of the final delivery completes the project."}
        </p>
      </section>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>
              {completed ? "Completed work & reviews" : "Project work"}
            </CardTitle>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {actions}
              {active && project.currentParty === "freelancer" && (
                <Dialog
                  open={uploadOpen}
                  onOpenChange={(open) => {
                    if (!busy) {
                      setUploadOpen(open);
                      if (open) setUploadError("");
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      aria-label="Upload project work"
                      title="Upload project work"
                      disabled={busy || !history || !paid}
                    >
                      <Plus className="h-4 w-4" />
                      Upload
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
                    <DialogHeader>
                      <DialogTitle>Upload project work</DialogTitle>
                      <DialogDescription>
                        Share a progress update or deliver finished work for
                        approval.
                      </DialogDescription>
                    </DialogHeader>
                    <form
                      className="space-y-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (kind === "delivery" && pendingDelivery) return;
                        setUploadError("");
                        void act(async () => {
                          try {
                            await submitProjectWork(
                              projectId,
                              milestone || null,
                              body,
                              link,
                              kind,
                              file,
                            );
                          } catch (cause) {
                            setUploadError(
                              cause instanceof Error
                                ? cause.message
                                : "Unable to submit work.",
                            );
                            throw cause;
                          }
                          setUploadOpen(false);
                          setBody("");
                          setLink("");
                          setFile(undefined);
                          setUploadKey((key) => key + 1);
                        }, "Work submitted. Your previous submissions remain in the history.");
                      }}
                    >
                      <fieldset disabled={busy} className="space-y-3">
                        <label className="block text-sm">
                          Submission type
                          <select
                            className="mt-1 w-full rounded-md border bg-background p-2"
                            value={kind}
                            onChange={(e) =>
                              setKind(e.target.value as "progress" | "delivery")
                            }
                          >
                            <option value="delivery">
                              Deliver work for approval
                            </option>
                            <option value="progress">Progress update</option>
                          </select>
                        </label>
                        {project.type === "milestone" && (
                          <label className="block text-sm">
                            Milestone
                            <select
                              required
                              className="mt-1 w-full rounded-md border bg-background p-2"
                              value={milestone}
                              onChange={(e) => setMilestone(e.target.value)}
                            >
                              <option value="">Choose milestone</option>
                              {project.milestones
                                .filter((m) => m.status !== "approved")
                                .map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.title}
                                  </option>
                                ))}
                            </select>
                          </label>
                        )}
                        <label className="block text-sm">
                          Freelancer notes
                          <Textarea
                            placeholder="Explain what you created, what changed, and what the client should review."
                            maxLength={10000}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                          />
                        </label>
                        <label className="block text-sm">
                          Link (optional)
                          <Input
                            type="url"
                            value={link}
                            onChange={(e) => setLink(e.target.value)}
                          />
                        </label>
                        <label className="block text-sm">
                          Attachment (up to 10 MB)
                          <Input
                            key={uploadKey}
                            type="file"
                            onChange={(e) => setFile(e.target.files?.[0])}
                          />
                          {file && (
                            <span className="mt-1 block break-all text-xs text-muted-foreground">
                              Selected: {file.name}
                            </span>
                          )}
                        </label>
                        {kind === "delivery" && pendingDelivery && (
                          <p className="text-sm text-muted-foreground">
                            This delivery is awaiting review. Wait for approval
                            or a revision request before sending another final
                            delivery.
                          </p>
                        )}
                        {uploadError && (
                          <p role="alert" className="text-sm text-destructive">
                            {uploadError}
                          </p>
                        )}
                        <Button
                          disabled={
                            busy ||
                            !history ||
                            (kind === "delivery" && pendingDelivery) ||
                            (!body.trim() && !link.trim() && !file)
                          }
                        >
                          {busy ? "Saving…" : "Submit work"}
                        </Button>
                      </fieldset>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Share screenshots, files, and notes. Review feedback stays with each
            delivery.
          </p>
          <p className="text-sm font-medium">
            {remaining == null
              ? "Revision allowance unavailable"
              : `${remaining} of ${project.revisions} revisions remaining`}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <div role="alert" className="text-sm text-destructive">
              {error}
              <Button variant="ghost" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
          {!history && !error && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading deliveries and feedback…
            </p>
          )}
          {active && history && (
            <p className="rounded-lg border bg-muted/20 p-3 text-sm">
              {reviewable.size > 0
                ? project.currentParty === "client"
                  ? "A delivery is ready. Review the files below, then approve the work or request changes. Approving the final delivery completes the project."
                  : "Your delivery is awaiting client review. You can continue posting progress updates."
                : project.status.toLowerCase() === "revision"
                  ? "Changes have been requested. Follow the feedback below and submit the revised work."
                  : project.currentParty === "client"
                    ? "Waiting for your freelancer to submit work for review."
                    : "Share a progress update or submit your finished work for client approval."}
            </p>
          )}
          {history?.submissions.map((submission) => (
            <article
              key={submission.submission_id}
              className="space-y-2 rounded-lg border p-4"
            >
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <strong>
                  {submission.kind === "delivery"
                    ? "Delivery"
                    : "Progress update"}
                </strong>
                <span className="capitalize">
                  {submission.status.replaceAll("_", " ")}
                </span>
              </div>
              <time className="text-xs text-muted-foreground">
                {new Date(submission.created_at).toLocaleString()}
              </time>
              {submission.milestone_id && (
                <p className="text-xs">
                  Milestone:{" "}
                  {project.milestones.find(
                    (m) => m.id === submission.milestone_id,
                  )?.title ?? "Milestone"}
                </p>
              )}
              <p className="whitespace-pre-wrap text-sm">{submission.body}</p>
              {submission.link && /^https?:\/\//i.test(submission.link) && (
                <a
                  className="block break-all text-sm underline"
                  href={submission.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open submitted link
                </a>
              )}
              {submission.attachment_path && (
                <SubmissionImage
                  path={submission.attachment_path}
                  name={submission.attachment_name ?? "Submitted screenshot"}
                />
              )}
              <div className="flex flex-wrap items-center gap-2">
                {submission.attachment_path && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void act(
                        () =>
                          openProjectAttachment(submission.attachment_path!),
                        "",
                      )
                    }
                  >
                    {submission.attachment_name ?? "Open attachment"}
                  </Button>
                )}
                {active &&
                  project.currentParty === "client" &&
                  submission.kind === "delivery" &&
                  reviewable.has(submission.submission_id) && (
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="Add revision feedback"
                      title="Add revision feedback"
                      disabled={busy || remaining == null || remaining === 0}
                      onClick={() => {
                        setFeedbackId(
                          feedbackId === submission.submission_id
                            ? null
                            : submission.submission_id,
                        );
                        setFeedback("");
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  )}
              </div>
              {feedbackId === submission.submission_id && (
                <form
                  className="space-y-2 rounded-lg border bg-muted/30 p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!feedback.trim() || !remaining || busy) return;
                    void act(async () => {
                      await reviewSubmission(
                        submission.submission_id,
                        "revision",
                        feedback,
                      );
                      setFeedbackId(null);
                      setFeedback("");
                    }, "Revision requested. Feedback saved with this delivery.");
                  }}
                >
                  <label
                    className="text-sm font-medium"
                    htmlFor={"feedback-" + submission.submission_id}
                  >
                    What needs changing?
                  </label>
                  <Textarea
                    id={"feedback-" + submission.submission_id}
                    autoFocus
                    rows={2}
                    maxLength={5000}
                    required
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="Describe the change to this screenshot or file?"
                  />
                  <p className="text-xs text-muted-foreground">
                    Sending requests changes and uses 1 revision. {remaining}{" "}
                    remaining.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy || !feedback.trim() || !remaining}
                    >
                      Send revision request
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setFeedbackId(null)}
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
              {history.revisions
                .filter((r) => r.submission_id === submission.submission_id)
                .map((r) => (
                  <div
                    key={r.revision_id}
                    className="rounded-md bg-muted p-3 text-sm"
                  >
                    <p className="font-medium">
                      Revision requested · {r.status}
                    </p>
                    <p className="whitespace-pre-wrap">{r.instructions}</p>
                    <time className="text-xs">
                      {new Date(r.created_at).toLocaleString()}
                    </time>
                  </div>
                ))}
              {active &&
                project.currentParty === "client" &&
                submission.kind === "delivery" &&
                reviewable.has(submission.submission_id) && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        setReviewing({ submission, action: "approve" })
                      }
                    >
                      {project.type === "standard" ||
                      project.milestones.filter((m) => m.status !== "approved")
                        .length === 1
                        ? "Approve & complete project"
                        : "Approve milestone"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || remaining == null || remaining === 0}
                      onClick={() => {
                        setInstructions("");
                        setReviewing({ submission, action: "revision" });
                      }}
                    >
                      Request revision
                    </Button>
                  </div>
                )}
            </article>
          ))}
          {history && !history.submissions.length && (
            <p className="text-sm text-muted-foreground">No submissions yet.</p>
          )}
          {completed && history && !ownReview && (
            <form
              className="space-y-3 border-t pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                void act(
                  () => leaveProjectReview(projectId, Number(rating), comment),
                  "Review published.",
                );
              }}
            >
              <h3 className="font-medium">Review this project</h3>
              <label className="block text-sm">
                Rating
                <select
                  className="ml-3 rounded-md border bg-background p-2"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} stars
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Comment
                <Textarea
                  maxLength={5000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              <Button disabled={busy}>Publish review</Button>
            </form>
          )}
          {history?.reviews.map((review) => (
            <div key={review.review_id} className="border-t pt-3 text-sm">
              <strong className="capitalize">
                {review.reviewer_role} review · {review.rating}/5
              </strong>
              <p>{review.comment}</p>
            </div>
          ))}
          <Dialog
            open={!!reviewing}
            onOpenChange={(open) => {
              if (!open && !busy) setReviewing(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {reviewing?.action === "approve"
                    ? "Approve this delivery?"
                    : "Request a revision"}
                </DialogTitle>
                <DialogDescription>
                  {reviewing?.action === "approve"
                    ? "Approval completes this milestone or standard project. The final milestone completes the project."
                    : "Describe corrections within the agreed scope. New work needs a separate agreement. The agreed revision limit applies."}
                </DialogDescription>
              </DialogHeader>
              {reviewing?.action === "revision" && (
                <label className="text-sm">
                  Revision instructions
                  <Textarea
                    maxLength={5000}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                </label>
              )}
              <Button
                disabled={
                  busy ||
                  (reviewing?.action === "revision" &&
                    (!instructions.trim() ||
                      remaining == null ||
                      remaining === 0))
                }
                onClick={() => {
                  if (reviewing)
                    void act(async () => {
                      await reviewSubmission(
                        reviewing.submission.submission_id,
                        reviewing.action,
                        instructions,
                      );
                      setReviewing(null);
                    }, "Delivery updated.");
                }}
              >
                {busy
                  ? "Saving…"
                  : reviewing?.action === "approve"
                    ? "Confirm approval"
                    : "Send revision request"}
              </Button>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
