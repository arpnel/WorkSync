"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";

import * as React from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BriefcaseBusiness,
  Clock3,
  ExternalLink,
  Sparkles,
  LoaderCircle,
  Star,
} from "lucide-react";
import type { ProjectRequest } from "@/services/project/projectRequestService";
import { RequestCard } from "./RequestCard";
import { ProjectCard, type Project } from "./ProjectCard";

interface Props {
  received: ProjectRequest[];
  sent: ProjectRequest[];
  serviceRequests: Project[];
  loading?: boolean;
  error?: string | null;
  actionId?: string | null;
  onReject: (request: ProjectRequest) => Promise<void>;
  onStartDiscussion: (request: ProjectRequest) => Promise<void>;
  onServiceChanged?: () => Promise<void> | void;
}

function asItems(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {}
  return value
    .split(/\r?\n|;/)
    .map((item) => item.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);
}

export function RequestList({
  received,
  sent,
  serviceRequests,
  loading,
  error,
  actionId,
  onReject,
  onStartDiscussion,
  onServiceChanged,
}: Props) {
  const [selectedRequest, setSelected] = React.useState<ProjectRequest | null>(
    null,
  );
  const [view, setView] = React.useState<"received" | "sent">("received");
  const [sortByScore, setSortByScore] = React.useState(false);
  const [responseErrors, setResponseErrors] = React.useState<
    Record<string, string>
  >({});
  const currentRequest = selectedRequest
    ? ([...received, ...sent].find(
        (item) => item.applicationId === selectedRequest.applicationId,
      ) ?? selectedRequest)
    : null;
  const selected = currentRequest;
  const selectedName =
    selected?.currentParty === "freelancer"
      ? selected.clientName
      : selected?.freelancerName;
  const selectedAvatar =
    selected?.currentParty === "freelancer"
      ? selected.clientAvatar
      : selected?.freelancerAvatar;
  const selectedUserId =
    selected?.currentParty === "freelancer"
      ? selected.clientUserId
      : selected?.freelancerUserId;
  const groups = React.useMemo(() => {
    const result = new Map<string, ProjectRequest[]>();
    for (const request of received)
      result.set(request.jobId, [
        ...(result.get(request.jobId) ?? []),
        request,
      ]);
    return [...result.values()].map((requests) =>
      sortByScore
        ? requests.sort(
            (a, b) => (b.screening?.score ?? -1) - (a.screening?.score ?? -1),
          )
        : requests,
    );
  }, [received, sortByScore]);
  const receivedServices = serviceRequests.filter(
    (request) => request.currentParty === "freelancer",
  );
  const sentServices = serviceRequests.filter(
    (request) => request.currentParty === "client",
  );
  const receivedCount = received.length + receivedServices.length;
  const sentCount = sent.length + sentServices.length;

  if (loading)
    return <ContentSkeleton label="Loading requests" variant="requests" />;
  if (error)
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-destructive">
          {error}
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Request inbox</h2>
          <p className="text-sm text-muted-foreground">
            {view === "received"
              ? "Compare applicants and choose who to discuss the project with."
              : "Track applications waiting for a client response."}
          </p>
        </div>
        <div
          className="grid grid-cols-2 rounded-lg bg-muted p-1"
          aria-label="Request view"
        >
          <button
            type="button"
            onClick={() => setView("received")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${view === "received" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Received <span className="ml-1 text-xs">{receivedCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setView("sent")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${view === "sent" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Sent <span className="ml-1 text-xs">{sentCount}</span>
          </button>
        </div>
      </div>

      {view === "received" && (
        <section className="space-y-3">
          {receivedCount ? (
            <>
              {received.length > 1 && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={sortByScore}
                    onChange={(event) => setSortByScore(event.target.checked)}
                  />
                  Sort applicants by AI match within each job
                </label>
              )}
              {groups.map((requests) => {
                const job = requests[0];
                return (
                  <Card key={job.jobId}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">
                            {job.jobTitle}
                          </CardTitle>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {[
                              job.categoryName,
                              job.jobBudget === null
                                ? null
                                : `₱${job.jobBudget.toLocaleString()}`,
                            ]
                              .filter(Boolean)
                              .join(" • ")}
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {requests.length}{" "}
                          {requests.length === 1 ? "Applicant" : "Applicants"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="overflow-x-auto p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Applicant</TableHead>
                            <TableHead>AI Match</TableHead>
                            <TableHead>Rating</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {requests.map((request) => (
                            <RequestCard
                              key={request.applicationId}
                              request={request}
                              onClick={setSelected}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                );
              })}
              {receivedServices.map((request) => (
                <ProjectCard
                  key={request.orderId}
                  project={request}
                  onChanged={onServiceChanged}
                />
              ))}
            </>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No incoming applications are awaiting review.
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {view === "sent" && (
        <section className="space-y-3">
          {sentCount ? (
            <div className="space-y-3">
              {sent.length > 0 && (
                <div className="grid gap-3 lg:grid-cols-2">
                  {sent.map((request) => (
                    <Card key={request.applicationId}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">
                              {request.jobTitle}
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Awaiting client review
                            </p>
                          </div>
                          <Badge variant="outline" className="capitalize">
                            {request.status.replaceAll("_", " ")}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Client: {request.clientName}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-5 text-sm">
                          <span>
                            <b>Proposal:</b>{" "}
                            {request.proposedPrice === null
                              ? "Not specified"
                              : `₱${request.proposedPrice.toLocaleString()}`}
                          </span>
                          <span>
                            <b>Delivery:</b>{" "}
                            {request.estimatedDays === null
                              ? "Not specified"
                              : `${request.estimatedDays} days`}
                          </span>
                        </div>
                        <Button
                          className="mt-4"
                          variant="outline"
                          onClick={() => setSelected(request)}
                        >
                          View application
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              {sentServices.map((request) => (
                <ProjectCard
                  key={request.orderId}
                  project={request}
                  onChanged={onServiceChanged}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No sent applications are awaiting review.
              </CardContent>
            </Card>
          )}
        </section>
      )}

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        {selected && (
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={selectedAvatar ?? undefined} />
                  <AvatarFallback>
                    {(selectedName ?? "").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span>
                  {selectedName}
                  <span className="block text-sm font-normal text-muted-foreground">
                    {selected.currentParty === "freelancer"
                      ? "Client"
                      : selected.freelancerHeadline || "Freelancer"}
                  </span>
                </span>
              </DialogTitle>
              <DialogDescription>{selected.jobTitle}</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Application by {selected.freelancerName}
            </p>
            <div className="grid gap-5 py-2 md:grid-cols-[1fr_180px]">
              <div className="space-y-5">
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {selected.rating !== null && (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      {selected.rating.toFixed(1)}
                    </span>
                  )}
                  <span>{selected.completedProjects} completed projects</span>
                  {selected.yearsOfExperience !== null && (
                    <span>{selected.yearsOfExperience} years experience</span>
                  )}
                </div>
                {selected.skills.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selected.skills.map((skill) => (
                      <Badge key={skill} variant="secondary">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}
                <div>
                  <h3 className="mb-2 font-semibold">Application</h3>
                  <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                    <p className="inline-flex gap-2">
                      <BriefcaseBusiness className="h-4 w-4" />
                      {selected.proposedPrice === null
                        ? "Price not specified"
                        : `₱${selected.proposedPrice.toLocaleString()}`}
                    </p>
                    <p className="inline-flex gap-2">
                      <Clock3 className="h-4 w-4" />
                      {selected.estimatedDays === null
                        ? "Delivery not specified"
                        : `${selected.estimatedDays} days`}
                    </p>
                    <p className="sm:col-span-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {selected.proposal || "No proposal message."}
                    </p>
                  </div>
                </div>
                {selected.portfolio.length > 0 && (
                  <div>
                    <h3 className="mb-2 font-semibold">Portfolio preview</h3>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {selected.portfolio.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border p-3 text-sm"
                        >
                          <p className="font-medium">
                            {item.title || "Portfolio project"}
                          </p>
                          {item.projectUrl && (
                            <a
                              href={item.projectUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-primary"
                            >
                              Open <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div
                role="status"
                aria-live="polite"
                aria-busy={!selected.screening}
                className="rounded-xl border bg-muted/30 p-4 text-center"
              >
                {selected.screening ? (
                  <Sparkles className="mx-auto h-5 w-5 text-primary" />
                ) : (
                  <LoaderCircle
                    aria-hidden="true"
                    className="mx-auto h-7 w-7 text-primary motion-safe:animate-spin"
                  />
                )}
                <p className="mt-2 text-xs font-semibold uppercase text-muted-foreground">
                  AI Match
                </p>
                <p className="mt-1 text-3xl font-bold">
                  {selected.screening?.score === null ||
                  selected.screening?.score === undefined
                    ? "—"
                    : `${selected.screening.score}%`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selected.screening?.result || "Preparing AI match..."}
                </p>
              </div>
            </div>
            <div className="space-y-3 rounded-lg border p-4">
              <h3 className="font-semibold">AI screening</h3>
              {!selected.screening && (
                <p className="text-sm text-muted-foreground">
                  Your match assessment will appear automatically when it is
                  ready.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Job match guidance based on submitted evidence. Review the
                application before deciding.
              </p>
              {selected.screening?.screenedAt && (
                <p className="text-xs text-muted-foreground">
                  Screened{" "}
                  {new Date(selected.screening.screenedAt).toLocaleDateString()}
                  {selected.screening.expiresAt
                    ? ` · Valid until ${new Date(selected.screening.expiresAt).toLocaleDateString()}`
                    : " · Saved assessment"}
                </p>
              )}
              {selected.screening ? (
                <>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Strengths
                    </p>
                    {asItems(selected.screening.strengths).map((item) => (
                      <p key={item} className="mt-1 text-sm">
                        • {item}
                      </p>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Weaknesses
                    </p>
                    {asItems(selected.screening.weaknesses).map((item) => (
                      <p key={item} className="mt-1 text-sm">
                        • {item}
                      </p>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Recommendation
                    </p>
                    <p className="mt-1 text-sm">
                      {selected.screening.recommendation ||
                        "No recommendation provided."}
                    </p>
                  </div>
                </>
              ) : (
                <div
                  aria-hidden="true"
                  className="space-y-2 motion-safe:animate-pulse"
                >
                  <div className="h-2 w-3/4 rounded-full bg-muted" />
                  <div className="h-2 w-1/2 rounded-full bg-muted" />
                  <div className="h-2 w-2/3 rounded-full bg-muted" />
                </div>
              )}
            </div>
            {responseErrors[selected.applicationId] && (
              <p role="alert" className="text-sm text-destructive">
                {responseErrors[selected.applicationId]}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
              {sent.some(
                (item) => item.applicationId === selected.applicationId,
              ) && (
                <Button asChild variant="outline">
                  <Link href={`/home/marketplace/jobs/${selected.jobId}`}>
                    View job / manage application
                  </Link>
                </Button>
              )}
              {selectedUserId && (
                <Button asChild variant="outline">
                  <Link href={`/home/profile/${selectedUserId}`}>
                    View full profile
                  </Link>
                </Button>
              )}
              {received.some(
                (item) => item.applicationId === selected.applicationId,
              ) && (
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={actionId === selected.applicationId}
                    onClick={async () => {
                      const id = selected.applicationId;
                      setResponseErrors((previous) => ({
                        ...previous,
                        [id]: "",
                      }));
                      try {
                        await onReject(selected);
                        setSelected((previous) =>
                          previous?.applicationId === id ? null : previous,
                        );
                      } catch (error) {
                        setResponseErrors((previous) => ({
                          ...previous,
                          [id]:
                            error instanceof Error
                              ? error.message
                              : "Rejection failed. Please retry.",
                        }));
                      }
                    }}
                  >
                    Reject
                  </Button>
                  <Button
                    disabled={actionId === selected.applicationId}
                    onClick={async () => {
                      const id = selected.applicationId;
                      setResponseErrors((previous) => ({
                        ...previous,
                        [id]: "",
                      }));
                      try {
                        await onStartDiscussion(selected);
                        setSelected((previous) =>
                          previous?.applicationId === id ? null : previous,
                        );
                      } catch (error) {
                        setResponseErrors((previous) => ({
                          ...previous,
                          [id]:
                            error instanceof Error
                              ? error.message
                              : "Starting discussion failed. Please retry.",
                        }));
                      }
                    }}
                  >
                    Start discussion
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
