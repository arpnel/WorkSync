export function projectProgress({
  completed,
  milestone,
  milestones = [],
  submissions = [],
}: {
  completed: boolean;
  milestone: boolean;
  milestones?: { status?: string }[];
  submissions?: { kind?: string; attachment_path?: string | null }[];
}) {
  if (completed) return 100;
  if (milestone) {
    const approved = milestones.filter((m) =>
      ["approved", "completed"].includes(m.status ?? ""),
    ).length;
    // Completion is persisted by the server, never inferred from uploads.
    return milestones.length
      ? Math.min(99, Math.round((approved / milestones.length) * 100))
      : 0;
  }
  const updates = submissions.filter((s) => s.kind === "progress").length;
  return Math.min(90, updates * 10);
}
