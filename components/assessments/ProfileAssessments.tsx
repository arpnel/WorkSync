"use client";
import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { getAssessmentEvidence } from "@/services/assessments/assessmentService";
import type { AssessmentEvidence } from "@/lib/assessments/types";
export function ProfileAssessments({ userId }: { userId: string }) {
  return <ProfileAssessmentResults key={userId} userId={userId} />;
}
function ProfileAssessmentResults({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AssessmentEvidence[]>([]),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void getAssessmentEvidence(userId)
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ClipboardCheck className="size-4" />
        Skill assessments
      </h3>
      <p className="text-xs text-muted-foreground">
        WorkSync knowledge assessments, not external certifications or identity
        verification.
      </p>
      {loading ? (
        <p className="text-sm">Loading results…</p>
      ) : error ? (
        <p className="text-sm text-muted-foreground">
          Assessment results are unavailable.
        </p>
      ) : rows.length ? (
        rows.map((r) => (
          <div
            key={r.category_id}
            className="rounded-lg bg-primary/5 p-3 text-sm"
          >
            <p className="font-medium">
              {r.category} · Assessment passed · {r.percentage}%
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Version {r.version} ·{" "}
              {new Date(r.completed_at).toLocaleDateString()}
            </p>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">
          No passed assessments to display.
        </p>
      )}
    </section>
  );
}
