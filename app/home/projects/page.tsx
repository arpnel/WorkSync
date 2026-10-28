"use client";
import { useSearchParams } from "next/navigation";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";
import { Suspense } from "react";
import ContentSkeleton from "@/components/shared/ContentSkeleton";

import { JobAgreementButton } from "@/components/project/JobAgreementButton";
import { ProjectList } from "@/components/project/ProjectList";
import { ProjectTabs } from "@/components/project/ProjectTabs";
import { ProjectToolbar } from "@/components/project/ProjectToolbar";
import { useProjectFilters } from "@/hooks/project/useProjectFilters";
import { useProjects } from "@/hooks/project/useProjects";
import { useProjectRequests } from "@/hooks/project/useProjectRequests";
import { RequestList } from "@/components/project/RequestList";
import { traceProjectFlow } from "@/services/project/projectFlowDiagnostics";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BriefcaseBusiness,
  CheckCircle2,
  FolderKanban,
  MessageSquareText,
} from "lucide-react";

export default function Page() {
  return (
    <Suspense
      fallback={<ContentSkeleton variant="projects" label="Loading projects" />}
    >
      <ProjectsPage />
    </Suspense>
  );
}

function ProjectsPage() {
  const { projects, loading, error, refetch } = useProjects();
  const allRequests = useProjectRequests();
  const jobId = useSearchParams().get("job");
  const requestState = {
    ...allRequests,
    requests: {
      received: allRequests.requests.received.filter(
        (row) => !jobId || row.jobId === jobId,
      ),
      sent: allRequests.requests.sent.filter(
        (row) => !jobId || row.jobId === jobId,
      ),
      discussions: allRequests.requests.discussions.filter(
        (row) => !jobId || row.jobId === jobId,
      ),
    },
  };
  const acceptedApplicationIds = new Set(
    requestState.requests.discussions.map((request) => request.applicationId),
  );
  const displayProjects = projects.map((project) =>
    project.applicationId &&
    acceptedApplicationIds.has(project.applicationId) &&
    project.status === "Request"
      ? { ...project, status: "In Discussion" }
      : project,
  );
  const {
    activeFilter,
    setActiveFilter,
    search,
    setSearch,
    sortMode,
    setSortMode,
    dateAscending,
    setDateAscending,
    nameAscending,
    setNameAscending,
    budgetAscending,
    setBudgetAscending,
    filteredProjects,
  } = useProjectFilters(displayProjects);

  const linkedApplications = new Set(
    displayProjects.map((project) => project.applicationId).filter(Boolean),
  );
  const discussions = requestState.requests.discussions.filter(
    (request) =>
      !linkedApplications.has(request.applicationId) &&
      [request.jobTitle, request.clientName, request.freelancerName].some(
        (value) => value.toLowerCase().includes(search.trim().toLowerCase()),
      ),
  );

  if (error && requestState.error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Projects
        </h1>
        <p className="text-sm text-destructive">
          {error || requestState.error}
        </p>
        <Button
          onClick={() => {
            void refetch();
            void requestState.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Projects"
        description="Manage requests, agree on the work, and follow delivery through to completion."
      />
      {!loading && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            {
              label: "All projects",
              count: projects.length,
              Icon: FolderKanban,
              iconTone: "bg-primary/10 text-primary",
            },
            {
              label: "Active",
              count: projects.filter((p) => p.status === "Active").length,
              Icon: BriefcaseBusiness,
              iconTone: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
            },
            {
              label: "In discussion",
              count:
                projects.filter((p) => p.status === "In Discussion").length +
                discussions.length,
              Icon: MessageSquareText,
              iconTone: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
            },
            {
              label: "Completed",
              count: projects.filter((p) => p.status === "Completed").length,
              Icon: CheckCircle2,
              iconTone:
                "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            },
          ].map(({ label, count, Icon, iconTone }) => (
            <Card className="h-full gap-0 py-5 transition-colors" key={label}>
              <CardContent>
                <div className="flex flex-wrap-reverse items-center justify-between gap-2">
                  <p className="text-sm leading-snug font-medium text-muted-foreground">
                    {label}
                  </p>
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-md ${iconTone}`}
                  >
                    <Icon
                      className="size-4 shrink-0 2xl:size-5"
                      aria-hidden="true"
                    />
                  </span>
                </div>
                <p className="mt-2 text-[clamp(1.75rem,1.25rem+1vw,2.5rem)] leading-tight font-semibold tabular-nums">
                  {count}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {(error || (activeFilter === "In Discussion" && requestState.error)) && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 p-4 text-sm"
        >
          <p className="text-destructive">{error || requestState.error}</p>
          <Button
            variant="outline"
            onClick={() => {
              void refetch();
              void requestState.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      )}
      <ProjectTabs
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />
      {activeFilter !== "Request" && (
        <ProjectToolbar
          search={search}
          onSearchChange={setSearch}
          sortMode={sortMode}
          setSortMode={setSortMode}
          dateAscending={dateAscending}
          setDateAscending={setDateAscending}
          nameAscending={nameAscending}
          setNameAscending={setNameAscending}
          budgetAscending={budgetAscending}
          setBudgetAscending={setBudgetAscending}
        />
      )}
      {activeFilter === "Request" && (
        <RequestList
          received={requestState.requests.received}
          sent={requestState.requests.sent}
          serviceRequests={displayProjects.filter(
            (project) => project.status === "Request",
          )}
          loading={requestState.loading}
          error={requestState.error}
          actionId={requestState.actionId}
          onReject={requestState.reject}
          onStartDiscussion={async (request) => {
            const conversationId = await requestState.startDiscussion(request);
            traceProjectFlow("accepted application moved to In Discussion", {
              applicationId: request.applicationId,
              jobId: request.jobId,
              returnedIdType: "conversation_id",
              conversationId,
            });
            setActiveFilter("In Discussion");
          }}
          onServiceChanged={refetch}
          onRefreshRequests={requestState.refetch}
        />
      )}
      {activeFilter === "In Discussion" && discussions.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide">
              Job Discussions
            </h2>
            <p className="text-sm text-muted-foreground">
              Applications selected for conversation and negotiation.
            </p>
          </div>
          {discussions.map((request) => (
            <JobAgreementButton
              key={request.applicationId}
              applicationId={request.applicationId}
              jobTitle={request.jobTitle}
              proposedPrice={request.proposedPrice}
              estimatedDays={request.estimatedDays}
              proposedPlan={request.proposedPlan}
            >
              <Card>
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{request.jobTitle}</h3>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      With{" "}
                      {request.currentParty === "freelancer"
                        ? request.clientName
                        : request.freelancerName}{" "}
                      • Discuss price, delivery, revisions, milestones, and
                      final terms.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </JobAgreementButton>
          ))}
        </section>
      )}
      {activeFilter !== "Request" && loading && (
        <ContentSkeleton label="Loading projects" variant="projects" />
      )}
      {activeFilter !== "Request" &&
        !loading &&
        !error &&
        (filteredProjects.length > 0 ||
          activeFilter !== "In Discussion" ||
          discussions.length === 0) && (
          <ProjectList projects={filteredProjects} onChanged={refetch} />
        )}
    </div>
  );
}
