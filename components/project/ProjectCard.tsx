"use client";

import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ListChecks,
  MessageSquare,
} from "lucide-react";

export interface Project {
  orderId: string;
  projectId: string | null;
  title: string;
  client: string;
  type: string;
  budget: number;
  createdAt: string;
  status: string;
  due: string | null;
  progress: number;
  milestones: number;
}

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter();
  const openProject = () => {
    const type = project.type === "Milestone" ? "milestone" : "standard";
    router.push(`/home/projects/${type}/${project.orderId}`);
  };

  return (
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
              </div>

              {/* Client */}
              <p className="mt-1 text-sm text-muted-foreground">
                {project.client}
              </p>

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
                <p className="mt-3 text-xs text-muted-foreground">
                  Waiting for the other party to respond
                </p>
              )}

              {/* Discussion */}
              {project.status === "In Discussion" && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Budget and project terms are being discussed
                </p>
              )}
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:flex sm:flex-wrap sm:items-center sm:gap-6 lg:min-w-[360px] lg:justify-end">
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
                    <p className="text-xs text-muted-foreground">Deadline</p>

                    <p className="font-medium text-muted-foreground">Not set</p>
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
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
