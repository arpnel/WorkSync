"use client";

import { ProjectResolutionPanel } from "@/components/project/ProjectResolutionPanel";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ArrowRight,
  ListChecks,
  MessageSquare,
  RotateCcw,
  Tag,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { respondToServiceRequest } from "@/services/project/projectService";
import * as React from "react";
import { format } from "date-fns";

export interface Project {
  orderId: string;
  applicationId?: string | null;
  clientSignedAt?: string | null;
  freelancerSignedAt?: string | null;
  currentUserId?: string;
  projectId: string | null;
  title: string;
  client: string;
  counterpartyName?: string;
  counterpartyUserId?: string;
  type: string;
  budget: number;
  createdAt: string;
  status: string;
  due: string | null;
  progress: number;
  milestones: number;
  currentParty: "client" | "freelancer" | null;
  requestDescription: string | null;
  deliveryDays: number | null;
  revisions: number | null;
  requestCategoryName: string | null;
}

interface ProjectCardProps {
  project: Project;
  onChanged?: () => Promise<void> | void;
}

export function ProjectCard({ project, onChanged }: ProjectCardProps) {
  const router = useRouter();
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [responding, setResponding] = React.useState(false);
  const [responseError, setResponseError] = React.useState<string | null>(null);
  const openProject = () => {
    if (project.status === "Request") {
      setReviewOpen(true);
      return;
    }
    const type = project.type === "Milestone" ? "milestone" : "standard";
    router.push(`/home/projects/${type}/${project.orderId}`);
  };

  const respond = async (accepted: boolean) => {
    setResponding(true);
    setResponseError(null);
    try {
      await respondToServiceRequest(project.orderId, accepted);
      setReviewOpen(false);
      await onChanged?.();
    } catch (error) {
      console.error("Failed to respond to service request:", error);
      setResponseError(
        error instanceof Error
          ? error.message
          : typeof error === "object" && error && "message" in error
            ? String(error.message)
            : "Unable to respond to this request.",
      );
    } finally {
      setResponding(false);
    }
  };

  if (project.status === "Request") {
    return (
      <>
        <button
          type="button"
          className="block w-full text-left"
          onClick={openProject}
        >
          <Card className="overflow-hidden transition hover:border-primary/40 hover:shadow-md">
            <CardContent className="p-0">
              <div className="flex flex-col gap-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Service request</Badge>
                    {project.requestCategoryName && (
                      <Badge variant="outline" className="font-normal">
                        <Tag className="mr-1 h-3 w-3" />
                        {project.requestCategoryName}
                      </Badge>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      project.currentParty === "freelancer"
                        ? "shrink-0 border-amber-200 bg-amber-50 font-normal text-amber-700"
                        : "shrink-0 font-normal"
                    }
                  >
                    {project.currentParty === "freelancer"
                      ? "Needs your response"
                      : "Awaiting response"}
                  </Badge>
                </div>

                <div>
                  <h2 className="font-semibold sm:text-base">
                    {project.title}
                  </h2>
                  <p className="mt-1.5 line-clamp-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {project.requestDescription ||
                      "No additional project details were provided."}
                  </p>
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Requested{" "}
                    {format(
                      new Date(project.createdAt),
                      "MMM d, yyyy 'at' h:mm a",
                    )}
                  </p>
                </div>

                <p className="text-sm text-muted-foreground">
                  {project.currentParty === "client" ? "Freelancer" : "Client"}:{" "}
                  {project.counterpartyName ?? project.client}
                </p>
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5">
                    <BriefcaseBusiness className="h-3.5 w-3.5 text-muted-foreground" />
                    ₱{project.budget.toLocaleString()}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5">
                    <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                    {project.deliveryDays == null
                      ? "Delivery not set"
                      : `${project.deliveryDays} days`}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5">
                    <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                    {project.revisions == null
                      ? "Revisions not set"
                      : `${project.revisions} ${project.revisions === 1 ? "revision" : "revisions"}`}
                  </span>
                </div>

                <div className="flex justify-end border-t pt-3 text-xs">
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 font-medium text-primary">
                    {project.currentParty === "freelancer"
                      ? "Review request"
                      : "View request"}
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </button>

        <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{project.title}</DialogTitle>
              <DialogDescription>
                {project.currentParty === "freelancer"
                  ? "Review the client's requirements before responding."
                  : "Review the request you sent to the freelancer."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                {project.requestCategoryName && (
                  <Badge variant="secondary">
                    <Tag className="mr-1 h-3 w-3" />
                    {project.requestCategoryName}
                  </Badge>
                )}
                <Badge variant="outline">{project.type}</Badge>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Project requirements
                </p>
                <p className="whitespace-pre-wrap rounded-lg border bg-muted/20 p-4 text-sm leading-6">
                  {project.requestDescription ||
                    "No additional project details were provided."}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 rounded-lg sm:grid-cols-3 border p-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Budget</p>
                  <p className="font-semibold">
                    ₱{project.budget.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Delivery</p>
                  <p className="font-semibold">
                    {project.deliveryDays == null
                      ? "—"
                      : `${project.deliveryDays} days`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Revisions</p>
                  <p className="font-semibold">{project.revisions ?? "—"}</p>
                </div>
              </div>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                Requested{" "}
                {format(new Date(project.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </p>
              {responseError && (
                <p className="text-sm text-destructive">{responseError}</p>
              )}
            </div>
            <ProjectResolutionPanel
              orderId={project.orderId}
              projectId={project.projectId}
              status="pending"
              userId={project.currentUserId ?? ""}
              onRefresh={async () => {
                await onChanged?.();
              }}
            />
            {project.counterpartyUserId && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  router.push(`/home/profile/${project.counterpartyUserId}`)
                }
              >
                View{" "}
                {project.currentParty === "client" ? "freelancer" : "client"}{" "}
                profile
              </Button>
            )}
            <DialogFooter>
              {project.currentParty === "freelancer" ? (
                <>
                  <Button
                    variant="destructive"
                    disabled={responding}
                    onClick={() => respond(false)}
                  >
                    Decline
                  </Button>
                  <Button disabled={responding} onClick={() => respond(true)}>
                    {responding ? "Saving..." : "Accept and discuss"}
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setReviewOpen(false)}>
                  Close
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className="block w-full text-left"
        onClick={openProject}
      >
        <Card className="transition hover:border-primary/30 hover:shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              {/* Project Info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{project.title}</h2>

                  {/* Status */}
                  <Badge
                    variant={
                      project.status === "Completed"
                        ? "secondary"
                        : project.status === "Request"
                          ? "outline"
                          : "default"
                    }
                    className={
                      project.status === "Completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : project.status === "In Discussion"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : ""
                    }
                  >
                    {project.status === "In Discussion" && (
                      <MessageSquare className="mr-1 h-3 w-3" />
                    )}

                    {project.status}
                  </Badge>

                  {/* Project Type */}
                  <Badge variant="outline" className="gap-1 font-normal">
                    {project.type === "Milestone" ? (
                      <ListChecks className="h-3 w-3" />
                    ) : (
                      <BriefcaseBusiness className="h-3 w-3" />
                    )}

                    {project.type}
                  </Badge>

                  {project.status === "Request" &&
                    project.requestCategoryName && (
                      <Badge variant="secondary">
                        {project.requestCategoryName}
                      </Badge>
                    )}
                </div>

                {/* Client */}
                <p className="mt-1 text-sm text-muted-foreground">
                  {project.counterpartyName ?? project.client}
                </p>

                {project.requestDescription && (
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                    {project.requestDescription}
                  </p>
                )}
                {project.status === "Active" && (
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <p>
                      {project.clientSignedAt && project.freelancerSignedAt
                        ? "Both parties agreed " +
                          format(
                            new Date(
                              Math.max(
                                Date.parse(project.clientSignedAt),
                                Date.parse(project.freelancerSignedAt),
                              ),
                            ),
                            "MMM d, yyyy 'at' h:mm a",
                          )
                        : "Agreement dates unavailable"}
                    </p>
                    <span className="inline-flex items-center gap-1 font-medium text-primary">
                      Open project <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                )}
                {/* Progress */}
                {(project.status === "Active" ||
                  project.status === "Completed") && (
                  <div className="mt-4 max-w-xl">
                    <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Project progress</span>

                      <span>{project.progress}%</span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${project.progress}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Request */}
                {project.status === "Request" && (
                  <div className="mt-3 space-y-1.5">
                    {project.requestDescription && (
                      <p className="line-clamp-2 max-w-2xl text-sm text-muted-foreground">
                        {project.requestDescription}
                      </p>
                    )}
                    <p className="text-xs font-medium text-primary">
                      {project.currentParty === "freelancer"
                        ? "Waiting for your response"
                        : "Waiting for the freelancer's response"}
                    </p>
                  </div>
                )}

                {/* Discussion */}
                {project.status === "In Discussion" && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Budget and project terms are being discussed
                  </p>
                )}
              </div>

              {/* Details */}
              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 gap-y-4 sm:flex sm:flex-wrap sm:items-center sm:gap-6 lg:min-w-[360px] lg:justify-end">
                {/* Budget */}
                <div className="flex items-center gap-2 text-sm">
                  <BriefcaseBusiness className="h-4 w-4 shrink-0 text-muted-foreground" />

                  <div>
                    <p className="text-xs text-muted-foreground">Budget</p>

                    <p className="font-medium">
                      ₱{project.budget.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Deadline */}
                {project.status === "Request" ||
                project.status === "In Discussion" ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" />

                    <div>
                      <p className="text-xs text-muted-foreground">Delivery</p>

                      <p className="font-medium">
                        {project.deliveryDays == null
                          ? "Not specified"
                          : `${project.deliveryDays} days`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm">
                    {project.status === "Completed" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}

                    <div>
                      <p className="text-xs text-muted-foreground">Deadline</p>

                      <p className="font-medium">{project.due}</p>
                    </div>
                  </div>
                )}

                {/* Milestones */}
                {project.type === "Milestone" && (
                  <div className="text-sm">
                    <p className="text-xs text-muted-foreground">Milestones</p>

                    <p className="font-medium">{project.milestones}</p>
                  </div>
                )}

                {project.status === "Request" && (
                  <div className="text-sm">
                    <p className="text-xs text-muted-foreground">Revisions</p>
                    <p className="font-medium">
                      {project.revisions ?? "Not specified"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </button>
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{project.title}</DialogTitle>
            <DialogDescription>
              {project.currentParty === "freelancer"
                ? "Review the client's requirements before responding."
                : "Review the request you sent to the freelancer."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {project.requestCategoryName && (
              <Badge variant="secondary">{project.requestCategoryName}</Badge>
            )}
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {project.requestDescription ||
                "No additional project details were provided."}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              Submitted {new Date(project.createdAt).toLocaleDateString()}
            </div>
            <div className="grid grid-cols-1 gap-3 rounded-lg sm:grid-cols-3 border p-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Budget</p>
                <p className="font-medium">
                  ₱{project.budget.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Delivery</p>
                <p className="font-medium">
                  {project.deliveryDays ?? "—"} days
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Revisions</p>
                <p className="font-medium">{project.revisions ?? "—"}</p>
              </div>
            </div>
            {responseError && (
              <p className="text-sm text-destructive">{responseError}</p>
            )}
          </div>
          {project.counterpartyUserId && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                router.push(`/home/profile/${project.counterpartyUserId}`)
              }
            >
              View {project.currentParty === "client" ? "freelancer" : "client"}{" "}
              profile
            </Button>
          )}
          <DialogFooter>
            {project.currentParty === "freelancer" ? (
              <>
                <Button
                  variant="destructive"
                  disabled={responding}
                  onClick={() => respond(false)}
                >
                  Decline
                </Button>
                <Button disabled={responding} onClick={() => respond(true)}>
                  Accept and discuss
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setReviewOpen(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
