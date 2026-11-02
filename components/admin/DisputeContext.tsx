"use client";

import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useEffect, useState } from "react";
import { getAdminDisputeContext } from "@/services/admin/adminService";
import type { AdminDisputeContext } from "@/services/admin/adminResponses";
import { openProjectAttachment } from "@/services/project/projectDeliveryService";
import { Button } from "@/components/ui/button";
import { AdminStatus } from "@/components/admin/admin-ui";

export default function DisputeContext({ id }: { id: string }) {
  const [data, setData] = useState<AdminDisputeContext | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    void getAdminDisputeContext(id)
      .then((result) => {
        if (alive) {
          setData(result);
          setError("");
        }
      })
      .catch((reason) => {
        if (alive) {
          setData(null);
          setError(reason instanceof Error ? reason.message : "Unable to load dispute context.");
        }
      });
    return () => {
      alive = false;
    };
  }, [id, retry]);

  async function file(path: string, kind: "dispute" | "submission", recordId: string) {
    try {
      await openProjectAttachment(path, kind, recordId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to open the attachment.");
    }
  }

  return (
    <section className="space-y-4 text-sm">
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive">
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={() => { setError(""); setRetry((value) => value + 1); }}>Retry</Button>
        </div>
      )}
      {!data ? (
        error ? null : <ContentSkeleton label="Loading dispute details" variant="detail" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <section className="min-w-0 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Project</h3>
                <AdminStatus tone={data.project.status === "completed" || data.project.status === "active" ? "green" : "neutral"}>
                  {data.project.status.replaceAll("_", " ")}
                </AdminStatus>
              </div>
              <p className="mt-2 break-words font-medium">{data.project.title}</p>
            </section>
            <section className="min-w-0 rounded-xl border p-4">
              <h3 className="font-semibold">Participants</h3>
              <div className="mt-2 space-y-3">
                {data.parties.map((party) => (
                  <div key={party.role} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="capitalize text-muted-foreground">{party.role}</span>
                    <span className="break-all text-right font-medium">{party.display_name ?? "Name unavailable"}</span>
                    <span className="w-full break-all text-right font-mono text-xs text-muted-foreground">Account ID: {party.user_id}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {data.contract && (
            <section className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Contract</h3>
                <AdminStatus tone={data.contract.status === "signed" || data.contract.status === "active" ? "green" : "neutral"}>
                  {data.contract.status.replaceAll("_", " ")}
                </AdminStatus>
              </div>
              <dl className="mt-3 grid gap-x-5 gap-y-2 sm:grid-cols-2">
                <dt className="text-muted-foreground">Agreed price</dt>
                <dd className="font-semibold tabular-nums">PHP {data.contract.final_price.toLocaleString("en-PH")}</dd>
                <dt className="text-muted-foreground">Delivery time</dt>
                <dd>{data.contract.delivery_time_days} days</dd>
                <dt className="text-muted-foreground">Revisions</dt>
                <dd>{data.contract.revisions_count}</dd>
              </dl>
              {data.contract.terms && (
                <details className="mt-3 border-t pt-3">
                  <summary className="cursor-pointer font-medium">Agreement terms</summary>
                  <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{data.contract.terms}</p>
                </details>
              )}
            </section>
          )}

          {(data.dispute.evidence_path || data.dispute.resolution) && (
            <section className="grid gap-3 sm:grid-cols-2">
              {data.dispute.evidence_path && (
                <div className="rounded-xl border p-4">
                  <h3 className="font-semibold">Dispute evidence</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Open the file attached to this dispute.</p>
                  <Button className="mt-3" variant="outline" onClick={() => void file(data.dispute.evidence_path!, "dispute", id)}>View evidence</Button>
                </div>
              )}
              {data.dispute.resolution && (
                <div className="rounded-xl border p-4">
                  <h3 className="font-semibold">Resolution</h3>
                  <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{data.dispute.resolution}</p>
                </div>
              )}
            </section>
          )}

          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-semibold">Milestones ({data.milestones.length})</summary>
            {data.milestones.length ? (
              <div className="mt-3 divide-y">
                {data.milestones.map((milestone) => (
                  <div key={milestone.milestone_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium">{milestone.title}</span>
                    <AdminStatus>{milestone.status.replaceAll("_", " ")}</AdminStatus>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-muted-foreground">No milestones recorded.</p>}
          </details>

          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-semibold">Submission history ({data.submissions.length})</summary>
            {data.submissions.length ? (
              <div className="mt-3 space-y-3">
                {data.submissions.map((submission) => (
                  <article key={submission.submission_id} className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium capitalize">{submission.kind.replaceAll("_", " ")}</p>
                      <AdminStatus>{submission.status.replaceAll("_", " ")}</AdminStatus>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(submission.created_at).toLocaleString()}</p>
                    {submission.body && <p className="mt-2 whitespace-pre-wrap break-words">{submission.body}</p>}
                    {submission.link && /^https?:\/\//i.test(submission.link) && <a className="mt-2 inline-block underline" href={submission.link} target="_blank" rel="noopener noreferrer">Submitted link</a>}
                    {submission.attachment_path && <Button variant="link" className="h-auto p-0" onClick={() => void file(submission.attachment_path!, "submission", submission.submission_id)}>{submission.attachment_name ?? "View attachment"}</Button>}
                  </article>
                ))}
              </div>
            ) : <p className="mt-2 text-muted-foreground">No submissions recorded.</p>}
          </details>

          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-semibold">Revision history ({data.revisions.length})</summary>
            {data.revisions.length ? (
              <div className="mt-3 space-y-2">
                {data.revisions.map((revision) => (
                  <article key={revision.revision_id} className="rounded-lg border bg-muted/20 p-3">
                    <AdminStatus>{revision.status.replaceAll("_", " ")}</AdminStatus>
                    <p className="mt-2 whitespace-pre-wrap break-words">{revision.instructions}</p>
                  </article>
                ))}
              </div>
            ) : <p className="mt-2 text-muted-foreground">No revision requests recorded.</p>}
          </details>

          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-semibold">Project conversation ({data.messages.length} messages)</summary>
            <p className="mt-2 text-xs text-muted-foreground">Access to this dispute context is recorded in the audit history.</p>
            {data.messages.length ? (
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                {data.messages.map((message) => (
                  <article key={message.message_id} className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">
                      {data.parties.find((party) => party.user_id === message.sender_id)?.display_name ?? message.sender_id}
                      {" · "}{new Date(message.created_at).toLocaleString()}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words">{message.message ?? "Attachment message"}</p>
                  </article>
                ))}
              </div>
            ) : <p className="mt-2 text-muted-foreground">No conversation messages recorded.</p>}
          </details>
        </>
      )}
    </section>
  );
}
