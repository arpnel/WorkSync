"use client";
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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  const requestState = useProjectRequests();
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
  } = useProjectFilters(projects);

  const linkedApplications = new Set(
    projects.map((project) => project.applicationId).filter(Boolean),
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
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Projects
      </h1>
      <p className="text-sm text-muted-foreground">
        Manage requests, agree on the work, and follow each project through
        delivery and completion.
      </p>
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
          serviceRequests={projects.filter(
            (project) => project.status === "Request",
          )}
          loading={requestState.loading}
          error={requestState.error}
          actionId={requestState.actionId}
          onReject={requestState.reject}
          onStartDiscussion={async (request) => {
            await requestState.startDiscussion(request);
            setActiveFilter("In Discussion");
          }}
          onServiceChanged={refetch}
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
            >
              <Card>
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{request.jobTitle}</h3>
                      <Badge className="bg-amber-50 text-amber-700">
                        In Discussion
                      </Badge>
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
