"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useEffect, useState } from "react";
import { getAdminDisputeContext } from "@/services/admin/adminService";
import type { AdminDisputeContext } from "@/services/admin/adminResponses";
import { openProjectAttachment } from "@/services/project/projectDeliveryService";
import { Button } from "@/components/ui/button";
export default function DisputeContext({ id }: { id: string }) {
  const [data, setData] = useState<AdminDisputeContext | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    void getAdminDisputeContext(id)
      .then((result) => {
        if (alive) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) {
          setData(null);
          setError(
            e instanceof Error ? e.message : "Unable to load dispute context.",
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [id, retry]);
  const file = (path: string) =>
    void openProjectAttachment(path).catch((e) => setError(e.message));
  return (
    <section className="space-y-3 text-sm">
      {error && (
        <p role="alert">
          {error}
          <Button
            variant="ghost"
            onClick={() => {
              setError("");
              setRetry(retry + 1);
            }}
          >
            Retry
          </Button>
        </p>
      )}
      {!data ? (
        error ? null : (
          <ContentSkeleton
            label="Loading dispute context"
            variant="verification-settings"
          />
        )
      ) : (
        <>
          <h3 className="font-semibold">
            {data.project.title} · {data.project.status}
          </h3>
          {data.parties.map((p) => (
            <p key={p.role} className="capitalize">
              {p.role}: {p.display_name ?? p.user_id}
            </p>
          ))}
          {data.contract && (
            <details>
              <summary>Agreement · {data.contract.status}</summary>
              <p>
                PHP {data.contract.final_price} ·{" "}
                {data.contract.delivery_time_days} days ·{" "}
                {data.contract.revisions_count} revisions
              </p>
              <p className="whitespace-pre-wrap break-words">
                {data.contract.terms}
              </p>
            </details>
          )}
          {data.dispute.evidence_path && (
            <Button
              variant="outline"
              onClick={() => file(data.dispute.evidence_path!)}
            >
              Open dispute evidence
            </Button>
          )}
          {data.dispute.resolution && (
            <p>Resolution: {data.dispute.resolution}</p>
          )}
          <details>
            <summary>Milestones ({data.milestones.length})</summary>
            {data.milestones.map((m) => (
              <p key={m.milestone_id}>
                {m.title} · {m.status}
              </p>
            ))}
          </details>
          <details>
            <summary>Submission history ({data.submissions.length})</summary>
            {data.submissions.map((s) => (
              <div key={s.submission_id} className="my-2 rounded border p-2">
                <p>
                  {s.kind} · {s.status} ·{" "}
                  {new Date(s.created_at).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap">{s.body}</p>
                {s.link && /^https?:\/\//i.test(s.link) && (
                  <a
                    className="underline"
                    href={s.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Submitted link
                  </a>
                )}
                {s.attachment_path && (
                  <Button
                    variant="link"
                    onClick={() => file(s.attachment_path!)}
                  >
                    {s.attachment_name ?? "Attachment"}
                  </Button>
                )}
              </div>
            ))}
          </details>
          <details>
            <summary>Revision history ({data.revisions.length})</summary>
            {data.revisions.map((r) => (
              <p key={r.revision_id}>
                {r.status} · {r.instructions}
              </p>
            ))}
          </details>
          <details>
            <summary>Relevant conversation (latest 100 messages)</summary>
            <p className="text-xs text-muted-foreground">
              Access to this dispute context is recorded in the audit history.
            </p>
            {data.messages.map((m) => (
              <div key={m.message_id} className="my-2 rounded border p-2">
                <p className="text-xs">
                  {data.parties.find((p) => p.user_id === m.sender_id)
                    ?.display_name ?? m.sender_id}{" "}
                  · {new Date(m.created_at).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap">
                  {m.message ?? "Attachment message"}
                </p>
              </div>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
