"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useEffect, useState } from "react";
import { platformAction } from "@/services/platform/platformService";
import {
  openProjectAttachment,
  type WorkSubmission,
  type RevisionRequest,
} from "@/services/project/projectDeliveryService";
import { Button } from "@/components/ui/button";
type Context = {
  project: {
    title: string;
    status: string;
    budget: number | null;
    due_date: string | null;
  };
  contract: {
    final_price: number;
    delivery_time_days: number;
    revisions_count: number;
    terms: string;
    status: string;
  } | null;
  dispute: { evidence_path: string | null; resolution: string | null };
  parties: { role: string; display_name: string | null; user_id: string }[];
  milestones: { milestone_id: string; title: string; status: string }[];
  submissions: WorkSubmission[];
  revisions: RevisionRequest[];
  messages: {
    message_id: string;
    sender_id: string;
    message: string | null;
    created_at: string;
  }[];
};
export default function DisputeContext({ id }: { id: string }) {
  const [data, setData] = useState<Context | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    void platformAction("worksync_dispute_context", { p_id: id })
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((e) => {
        if (alive) setError(e.message);
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
        <ContentSkeleton
          label="Loading dispute context"
          variant="verification-settings"
        />
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
