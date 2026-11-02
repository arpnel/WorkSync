const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
export const PROJECT_DEADLINE_GRACE_DAYS = 14;

export function getMaximumProposalDeliveryDays(
  deadline: string | null,
  now: Date = new Date(),
): number | null {
  if (!deadline) return null;
  const deadlineTime = new Date(deadline).getTime();
  if (!Number.isFinite(deadlineTime)) return null;

  const daysUntilDeadline = Math.ceil(
    (deadlineTime - now.getTime()) / DAY_IN_MILLISECONDS,
  );
  return daysUntilDeadline + PROJECT_DEADLINE_GRACE_DAYS;
}
