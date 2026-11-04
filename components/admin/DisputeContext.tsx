"use client";

import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useEffect, useState } from "react";
import { getAdminDisputeContext } from "@/services/admin/adminService";
import type { AdminDisputeContext } from "@/services/admin/adminResponses";
import { openProjectAttachment } from "@/services/project/projectDeliveryService";
import { Button } from "@/components/ui/button";
import { AdminStatus } from "@/components/admin/admin-ui";
import {
  projectPlanSnapshotSchema,
  type ProjectPlanSnapshotData,
} from "@/services/project/projectPlanSnapshot";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ContractTermsRecord = Record<string, unknown>;
type ParsedContractTerms = {
  plainText: string | null;
  terms: Array<{ label: string; value: string }> | null;
  plan: ProjectPlanSnapshotData | null;
  planUnavailable: boolean;
  projectTitle: string | null;
  description: string | null;
  startDate: string | null;
  deadline: string | null;
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
      .filter(([key]) => !/(^id$|_id$|Id$|^schemaVersion$)/i.test(key))
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
      plan: null,
      planUnavailable: false,
      projectTitle: null,
      description: null,
      startDate: null,
      deadline: null,
    };
  }

  if (!isRecord(value)) {
    return {
      plainText: typeof value === "string" ? value : readableTermValue(value),
      terms: null,
      plan: null,
      planUnavailable: false,
      projectTitle: null,
      description: null,
      startDate: null,
      deadline: null,
    };
  }

  const planValue = isRecord(value.plan) ? value.plan : null;
  const parsedPlan = planValue
    ? projectPlanSnapshotSchema.safeParse({
        ...planValue,
        description: typeof planValue.description === "string" ? planValue.description : "",
      })
    : null;
  const plan = parsedPlan?.success ? parsedPlan.data : null;
  const terms = Object.entries(value)
    .filter(([key]) => !["plan", "schemaVersion", "projectTitle", "description", "startDate", "deadline", "budget", "deliveryDays", "revisionsCount"].includes(key))
    .map(([key, item]) => ({ label: readableLabel(key), value: readableTermValue(item) }))
    .filter((item) => item.value);

  return {
    plainText: null,
    terms,
    plan,
    planUnavailable: Boolean(planValue && !plan),
    projectTitle: typeof value.projectTitle === "string" ? value.projectTitle : null,
    description: typeof value.description === "string" ? value.description : null,
    startDate: typeof value.startDate === "string" ? value.startDate : null,
    deadline: typeof value.deadline === "string" ? value.deadline : null,
  };
}

function formatContractDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function ContractTermsOverview({ raw }: { raw: string }) {
  const parsed = parseContractTerms(raw);
  if (parsed.plainText !== null) {
    return <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{parsed.plainText}</p>;
  }

  return (
    <div className="mt-3 space-y-4">
      {parsed.projectTitle && <p className="font-medium">{parsed.projectTitle}</p>}
      {parsed.description && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project description</h4>
          <p className="mt-1 whitespace-pre-wrap break-words">{parsed.description}</p>
        </div>
      )}
      {(parsed.startDate || parsed.deadline) && (
        <dl className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
          {parsed.startDate && <><dt className="text-muted-foreground">Start date</dt><dd>{formatContractDate(parsed.startDate)}</dd></>}
          {parsed.deadline && <><dt className="text-muted-foreground">Deadline</dt><dd>{formatContractDate(parsed.deadline)}</dd></>}
        </dl>
      )}
      {parsed.plan && (
        <ContractPlanOverview
          plan={parsed.plan}
          projectDescription={parsed.description}
        />
      )}
      {parsed.planUnavailable && (
        <p className="text-muted-foreground">The saved work plan could not be displayed.</p>
      )}
      {parsed.terms?.map((item) => (
        <div key={item.label}>
          <h4 className="font-medium">{item.label}</h4>
          <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function ContractPlanOverview({
  plan,
  projectDescription,
}: {
  plan: ProjectPlanSnapshotData;
  projectDescription: string | null;
}) {
  const taskCount = plan.content.columns.reduce((total, column) => total + column.tasks.length, 0);
  const normalizeDescription = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  const showPlanDescription =
    plan.description.trim() &&
    normalizeDescription(plan.description) !== normalizeDescription(projectDescription ?? "");
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <h4 className="font-medium">Work plan</h4>
        <p className="mt-1 text-muted-foreground">
          {plan.name} · {plan.content.columns.length} stages · {taskCount} tasks
        </p>
      </div>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">View plan</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{plan.name}</DialogTitle>
            <DialogDescription>
              {plan.content.columns.length} stages · {taskCount} tasks
            </DialogDescription>
          </DialogHeader>
          {showPlanDescription && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{plan.description}</p>
          )}
          <div className="space-y-3">
            {plan.content.columns.map((column) => (
              <section key={column.id} className="rounded-lg border bg-muted/30 p-3">
                <h5 className="font-medium">{column.name}</h5>
                {column.tasks.length ? (
                  <ul className="mt-2 space-y-3">
                    {column.tasks.map((task) => (
                      <li key={task.id} className="border-t pt-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{task.title}</span>
                          <span className="text-xs capitalize text-muted-foreground">
                            {task.priority}{task.expectedDays ? ` · ${task.expectedDays} days` : ""}
                          </span>
                        </div>
                        {task.description && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{task.description}</p>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-1 text-muted-foreground">No tasks in this stage.</p>}
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

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

  async function file(path: string) {
    try {
      await openProjectAttachment(path);
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
                    {party.user_id ? (
                      <span className="w-full break-all text-right font-mono text-xs text-muted-foreground">
                        Account ID: {party.user_id}
                      </span>
                    ) : party.profile_id ? (
                      <span className="w-full break-all text-right font-mono text-xs text-muted-foreground">
                        Profile ID: {party.profile_id}
                      </span>
                    ) : null}
                  </div>
                ))}
                {data.parties.length === 0 && (
                  <p className="text-muted-foreground">Participant details were not returned.</p>
                )}
              </div>
            </section>
          </div>

          <section className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Contract overview</h3>
              {data.contract && (
                <AdminStatus tone={data.contract.status === "signed" || data.contract.status === "active" ? "green" : "neutral"}>
                  {data.contract.status.replaceAll("_", " ")}
                </AdminStatus>
              )}
            </div>
            {data.contract ? (
              <>
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
                    <ContractTermsOverview raw={data.contract.terms} />
                  </details>
                )}
              </>
            ) : data.contextLimitations.includes("contract") ? (
              <p className="mt-2 text-muted-foreground">
                Contract overview is unavailable until the dispute-context database update is installed.
              </p>
            ) : (
              <p className="mt-2 text-muted-foreground">No contract is linked to this project.</p>
            )}
          </section>

          {(data.dispute.evidence_path || data.dispute.resolution) && (
            <section className="grid gap-3 sm:grid-cols-2">
              {data.dispute.evidence_path && (
                <div className="rounded-xl border p-4">
                  <h3 className="font-semibold">Dispute evidence</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Open the file attached to this dispute.</p>
                  <Button className="mt-3" variant="outline" onClick={() => void file(data.dispute.evidence_path!)}>View evidence</Button>
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
            <summary className="cursor-pointer font-semibold">
              {data.contextLimitations.includes("complete_milestone_list") ? "Affected milestone" : "Milestones"} ({data.milestones.length})
            </summary>
            {data.milestones.length ? (
              <div className="mt-3 divide-y">
                {data.milestones.map((milestone) => (
                  <div key={milestone.milestone_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium">{milestone.title}</span>
                    <AdminStatus>{milestone.status.replaceAll("_", " ")}</AdminStatus>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-muted-foreground">{data.contextLimitations.includes("complete_milestone_list") ? "The deployed function did not return an affected milestone." : "No milestones recorded."}</p>}
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
