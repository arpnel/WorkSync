"use client";

import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useEffect, useState } from "react";
import {
  getAdminDisputeContext,
} from "@/services/admin/adminService";
import type { AdminDisputeContext } from "@/services/admin/adminResponses";
import {
  downloadProjectAttachment,
  openProjectAttachment,
} from "@/services/project/projectDeliveryService";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { AdminStatus } from "@/components/admin/admin-ui";

type ContractTermsRecord = Record<string, unknown>;
type ParsedContractTerms = {
  plainText: string | null;
  terms: Array<{ label: string; value: string }> | null;
};
function isRecord(value: unknown): value is ContractTermsRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readableLabel(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function readableTermValue(value: unknown, depth = 0): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => readableTermValue(item, depth + 1))
      .filter(Boolean)
      .map((item) => `${"  ".repeat(depth)}• ${item}`)
      .join("\n");
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([key]) => {
        const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
        return (
          !/(^id$|_id$|Id$|^schemaVersion$)/i.test(key) &&
          normalizedKey !== "categoryname"
        );
      })
      .map(([key, item]) => {
        const text = readableTermValue(item, depth + 1);
        return text ? `${"  ".repeat(depth)}${readableLabel(key)}: ${text}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function parseContractTerms(raw: string): ParsedContractTerms {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      plainText: raw,
      terms: null,
    };
  }

  if (!isRecord(value)) {
    return {
      plainText: typeof value === "string" ? value : readableTermValue(value),
      terms: null,
    };
  }

  const summaryFields = new Set([
    "plan",
    "schemaversion",
    "projecttitle",
    "description",
    "startdate",
    "deadline",
    "budget",
    "price",
    "finalprice",
    "agreedprice",
    "deliverydays",
    "deliverytime",
    "deliverytimedays",
    "revisions",
    "revisionscount",
    "includedrevisions",
    "categoryid",
    "categoryname",
  ]);
  const terms = Object.entries(value)
    .filter(([key]) => {
      const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
      return !summaryFields.has(normalizedKey);
    })
    .map(([key, item]) => ({ label: readableLabel(key), value: readableTermValue(item) }))
    .filter((item) => item.value);

  return {
    plainText: null,
    terms,
  };
}

function ContractTermsOverview({ raw }: { raw: string }) {
  const parsed = parseContractTerms(raw);
  if (parsed.plainText !== null) {
    return <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{parsed.plainText}</p>;
  }

  return (
    <div className="space-y-4">
      {parsed.terms?.map((item) => (
        <div key={item.label}>
          <h4 className="font-medium">{item.label}</h4>
          <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function DisputeEvidencePreview({ path }: { path: string }) {
  const [preview, setPreview] = useState<{ path: string; url: string } | null>(null);
  const image = /\.(png|jpe?g|webp|gif|avif)$/i.test(path);

  useEffect(() => {
    if (!image) return;
    let alive = true;
    void supabase.storage
      .from("project-attachments")
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (error) throw error;
        if (alive) setPreview({ path, url: data.signedUrl });
      })
      .catch(() => {
        if (alive) setPreview({ path, url: "" });
      });
    return () => {
      alive = false;
    };
  }, [image, path]);

  if (!image) return null;
  if (preview?.path !== path) {
    return <p className="mt-3 text-sm text-muted-foreground">Loading image preview…</p>;
  }
  if (!preview.url) {
    return <p className="mt-3 text-sm text-muted-foreground">Preview unavailable. Download the evidence to view it.</p>;
  }
  return (
    // Signed private images are rendered directly without the public image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={preview.url}
      alt="Dispute evidence"
      loading="lazy"
      className="mt-3 max-h-96 w-full rounded-lg border bg-muted/20 object-contain"
    />
  );
}

export default function DisputeContext({
  id,
}: {
  id: string;
}) {
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

  async function file(path: string, download = false) {
    try {
      if (download) await downloadProjectAttachment(path);
      else await openProjectAttachment(path);
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
          <section className="space-y-3 rounded-xl border p-4">
            <h3 className="font-semibold">Details</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Project</p>
                <p className="mt-1 break-words font-medium">{data.project.title}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="mt-1">
                  <AdminStatus tone={data.project.status === "completed" || data.project.status === "active" ? "green" : "neutral"}>
                    {data.project.status.replaceAll("_", " ")}
                  </AdminStatus>
                </div>
              </div>
              {data.parties.map((party) => (
                <div key={party.role} className="min-w-0">
                  <p className="text-xs capitalize text-muted-foreground">{party.role}</p>
                  <p className="mt-1 break-words font-medium">
                    {party.display_name ?? "Name unavailable"}
                  </p>
                </div>
              ))}
              {data.parties.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Participant details were not returned.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Contract overview</h3>
              {data.contract && (
                <AdminStatus tone={data.contract.status === "signed" || data.contract.status === "active" ? "green" : "neutral"}>
                  {data.contract.status.replaceAll("_", " ")}
                </AdminStatus>
              )}
            </div>
            {data.contract ? (
              <>
                <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Agreed price</dt>
                    <dd className="mt-1 font-semibold tabular-nums">PHP {data.contract.final_price.toLocaleString("en-PH")}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Delivery time</dt>
                    <dd className="mt-1 font-medium">{data.contract.delivery_time_days} days</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Revisions</dt>
                    <dd className="mt-1 font-medium">{data.contract.revisions_count}</dd>
                  </div>
                </dl>
                <div>
                  {data.contract.terms ? (
                    <ContractTermsOverview raw={data.contract.terms} />
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No agreement terms or work plan were recorded.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {data.contextLimitations.includes("contract")
                  ? "Contract details are unavailable."
                  : "No contract is linked to this project."}
              </p>
            )}
          </section>

          {(data.dispute.evidence_path || data.dispute.resolution) && (
            <section className="space-y-3">
              {data.dispute.evidence_path && (
                <div className="rounded-xl border p-4">
                  <h3 className="font-semibold">Dispute evidence</h3>
                  <DisputeEvidencePreview path={data.dispute.evidence_path} />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 break-all text-xs text-muted-foreground">
                      {data.dispute.evidence_path.split("/").pop() || "Attached evidence"}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void file(data.dispute.evidence_path!, true)}
                    >
                      Download evidence
                    </Button>
                  </div>
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

          {data.milestones.length > 0 && (
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer font-semibold">
                {data.contextLimitations.includes("complete_milestone_list") ? "Affected milestone" : "Milestones"} ({data.milestones.length})
              </summary>
              <div className="mt-3 divide-y">
                {data.milestones.map((milestone) => (
                  <div key={milestone.milestone_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium">{milestone.title}</span>
                    <AdminStatus>{milestone.status.replaceAll("_", " ")}</AdminStatus>
                  </div>
                ))}
              </div>
            </details>
          )}

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
                    {submission.attachment_path && <Button variant="link" className="h-auto p-0" onClick={() => void file(submission.attachment_path!)}>{submission.attachment_name ?? "View attachment"}</Button>}
                  </article>
                ))}
              </div>
            ) : <p className="mt-2 text-muted-foreground">No submissions recorded.</p>}
          </details>

        </>
      )}
    </section>
  );
}
