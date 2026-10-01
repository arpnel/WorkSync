/** Review windows start at delivery, not the planned work due date. */
export function automaticReviewAt(
  submittedAt: string,
  _dueDate: string | null,
  finalDelivery = true,
) {
  const submitted = Date.parse(submittedAt);
  if (!Number.isFinite(submitted)) return null;
  return new Date(submitted + (finalDelivery ? 7 : 3) * 86400000).toISOString();
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
