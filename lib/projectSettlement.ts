/** Standard delivery uses the original deadline plus 72 hours; milestones use submission plus 72 hours. */
export function automaticReviewAt(
  submittedAt: string,
  originalDeadline: string | null,
  milestone = false,
) {
  const submitted = Date.parse(submittedAt);
  if (!Number.isFinite(submitted)) return null;
  const deadline = milestone ? submitted : Date.parse(originalDeadline ?? "");
  if (!Number.isFinite(deadline)) return null;
  return new Date(deadline + 72 * 60 * 60 * 1000).toISOString();
}

export function projectIsOverdue(
  status: string,
  dueDate: string | null,
  now: number,
) {
  return (
    ["active", "in_progress", "revision"].includes(status.toLowerCase()) &&
    !!dueDate &&
    Date.parse(dueDate) < now
  );
}
