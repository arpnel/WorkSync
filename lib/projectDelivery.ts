/** Only the newest delivery for an unfinished milestone can be reviewed. */
export function reviewableDeliveryIds(
  submissions: {
    submission_id: string;
    milestone_id: string | null;
    kind: string;
    status: string;
    created_at: string;
  }[],
  milestones: { id: string; status: string }[],
) {
  const newest = new Map<string | null, (typeof submissions)[number]>();
  for (const submission of submissions) {
    if (submission.kind !== "delivery") continue;
    const previous = newest.get(submission.milestone_id);
    if (
      !previous ||
      Date.parse(submission.created_at) > Date.parse(previous.created_at)
    ) {
      newest.set(submission.milestone_id, submission);
    }
  }
  return new Set(
    [...newest.values()]
      .filter(
        (submission) =>
          submission.status === "submitted" &&
          (submission.milestone_id === null
            ? milestones.length === 0
            : milestones.some(
                (milestone) =>
                  milestone.id === submission.milestone_id &&
                  !["approved", "completed"].includes(milestone.status),
              )),
      )
      .map((submission) => submission.submission_id),
  );
}
