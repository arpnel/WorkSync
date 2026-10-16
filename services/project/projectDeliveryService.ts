import { submitPaidWork } from "./paidWorkService";
import { getProjectPayment } from "@/services/payments/paymentService";
import { supabase } from "@/lib/supabaseClient";
import {
  databaseError,
  platformAction,
  requireUser,
} from "@/services/platform/platformService";
export interface WorkSubmission {
  submission_id: string;
  project_id: string;
  milestone_id: string | null;
  author_id: string;
  body: string;
  link: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  kind: "progress" | "delivery";
  status: "submitted" | "revision_requested" | "approved";
  created_at: string;
  auto_reviewed_at?: string | null;
}
export interface RevisionRequest {
  revision_id: string;
  submission_id: string;
  instructions: string;
  created_at: string;
  status: string;
}
export interface ProjectSubmissionComment {
  comment_id: string;
  submission_id: string;
  project_id: string;
  author_id: string;
  body: string;
  created_at: string;
}
export interface ProjectReview {
  review_id: string;
  rating: number;
  comment: string | null;
  reviewer_role: string;
}
export async function getDeliveryHistory(projectId: string) {
  const [submissions, revisions, reviews] = await Promise.all([
    supabase
      .from("project_submissions")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("revision_requests")
      .select("revision_id, submission_id, instructions, created_at, status")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("reviews")
      .select("review_id, rating, comment, reviewer_role")
      .eq("project_id", projectId),
  ]);
  for (const result of [submissions, revisions, reviews])
    if (result.error) throw databaseError(result.error);
  const submissionRows = (submissions.data ?? []) as WorkSubmission[];
  const commentsResult = submissionRows.length
    ? await supabase
        .from("project_submission_comments")
        .select("comment_id, submission_id, project_id, author_id, body, created_at")
        .eq("project_id", projectId)
        .in("submission_id", submissionRows.map((row) => row.submission_id))
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (commentsResult.error) throw databaseError(commentsResult.error);
  return {
    submissions: submissionRows,
    revisions: (revisions.data ?? []) as RevisionRequest[],
    reviews: (reviews.data ?? []) as ProjectReview[],
    comments: (commentsResult.data ?? []) as ProjectSubmissionComment[],
  };
}

export async function addProjectSubmissionComment(
  projectId: string,
  submissionId: string,
  body: string,
): Promise<void> {
  const user = await requireUser();
  const content = body.trim();
  if (!content || content.length > 2000)
    throw new Error("Comments must be between 1 and 2,000 characters.");
  const { error } = await supabase.from("project_submission_comments").insert({
    project_id: projectId,
    submission_id: submissionId,
    author_id: user.id,
    body: content,
  });
  if (error) throw databaseError(error);
}
export async function submitProjectWork(
  projectId: string,
  milestoneId: string | null,
  body: string,
  link: string,
  kind: "progress" | "delivery",
  file?: File,
) {
  const user = await requireUser();
  if (!body.trim() && !file && !link.trim())
    throw new Error("Add a message, link or attachment.");
  if (body.length > 10000)
    throw new Error("Keep your message within 10,000 characters.");
  if (link.trim()) {
    const url = new URL(link);
    if (!["https:", "http:"].includes(url.protocol))
      throw new Error("Use an HTTP or HTTPS link.");
  }
  if (file && file.size > 10 * 1024 * 1024)
    throw new Error("Files must be 10 MB or smaller.");
  const payment = await getProjectPayment(projectId);
  if (payment.status !== "paid")
    throw new Error("The client must pay before work can be submitted.");
  const id = crypto.randomUUID();
  let path: string | null = null;
  if (file) {
    if (file.size > 10 * 1024 * 1024)
      throw new Error("Files must be 10 MB or smaller.");
    path = `${projectId}/${user.id}/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage
      .from("project-attachments")
      .upload(path, file, { upsert: false });
    if (error) throw databaseError(error);
  }
  try {
    await submitPaidWork({
      p_id: id,
      p_project: projectId,
      p_milestone: milestoneId,
      p_body: body.trim(),
      p_link: link.trim() || null,
      p_kind: kind,
      p_path: path,
      p_name: file?.name ?? null,
    });
  } catch (cause) {
    if (path) await supabase.storage.from("project-attachments").remove([path]);
    throw cause;
  }
}
export async function openProjectAttachment(path: string) {
  const { data, error } = await supabase.storage
    .from("project-attachments")
    .createSignedUrl(path, 60);
  if (error) throw databaseError(error);
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
export type SettlementReviewOutcome = {
  status:
    | "disabled"
    | "version_unavailable"
    | "payment_unavailable"
    | "reviewed_pending"
    | "completed"
    | "verification_failed"
    | "request_failed";
  detail?: string;
};

export async function requestProjectSettlementReview(
  projectId: string,
  submissionId: string,
): Promise<SettlementReviewOutcome> {
  try {
    const { data, error } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (error || !accessToken)
      return { status: "request_failed", detail: "Your session could not be verified." };
    const response = await fetch("/api/project-review", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ projectId, submissionId }),
      cache: "no-store",
    });
    const result = (await response.json().catch(() => null)) as
      | { settlementReviewStatus?: SettlementReviewOutcome["status"]; error?: string }
      | null;
    if (!response.ok)
      return {
        status: "verification_failed",
        detail: result?.error ?? `Settlement request failed (${response.status}).`,
      };
    if (!result?.settlementReviewStatus)
      return { status: "request_failed", detail: "The server returned an invalid settlement response." };
    return {
      status: result.settlementReviewStatus,
      ...(result.error ? { detail: result.error } : {}),
    };
  } catch (cause) {
    return {
      status: "request_failed",
      detail: cause instanceof Error ? cause.message : "Network request failed.",
    };
  }
}
export async function reviewSubmission(
  projectId: string,
  id: string,
  action: "approve" | "revision",
  instructions: string,
): Promise<SettlementReviewOutcome | null> {
  if (action === "revision" && !instructions.trim())
    throw new Error("Explain the changes needed within the agreed scope.");
  await platformAction("worksync_review_submission", {
    p_submission: id,
    p_action: action,
    p_instructions: instructions.trim(),
  });
  if (action === "revision") return null;

  return requestProjectSettlementReview(projectId, id);
}

export async function leaveProjectReview(
  projectId: string,
  rating: number,
  comment: string,
) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw new Error("Choose a rating from 1 to 5.");
  await platformAction("worksync_leave_review", {
    p_project: projectId,
    p_rating: rating,
    p_comment: comment.trim(),
  });
}
