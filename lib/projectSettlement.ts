/** Deadline is inclusive; late deliveries become eligible at submission, never before. */
export function automaticReviewAt(submittedAt: string, dueDate: string | null) {
  const submitted = Date.parse(submittedAt);
  if (!Number.isFinite(submitted)) return null;
  const deadline = dueDate ? Date.parse(dueDate) : NaN;
  return new Date(
    Math.max(
      submitted,
      Math.min(
        submitted + 7 * 86400000,
        Number.isFinite(deadline) ? deadline : Infinity,
      ),
    ),
  ).toISOString();
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
