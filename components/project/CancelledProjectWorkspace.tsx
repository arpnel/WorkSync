"use client";

import { CalendarDays, RotateCcw, Wallet } from "lucide-react";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectDeliveryPanel } from "./ProjectDeliveryPanel";
import { ContractSummary } from "./ContractSummary";
import { ProjectWorkspaceHeader } from "./ProjectWorkspaceHeader";

export function CancelledProjectWorkspace({
  project,
  error,
  onRefresh,
  onBack,
}: {
  project: ProjectWorkspace;
  error: string | null;
  onRefresh: () => Promise<void>;
  onBack: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 sm:px-6">
      <ProjectWorkspaceHeader
        compact
        title={project.title}
        description={project.description}
        categoryName={project.categoryName}
        status={project.status}
        type={project.type}
        onBack={onBack}
      />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <section
        role="status"
        className="rounded-xl border border-destructive/20 bg-destructive/5 p-4"
      >
        <h2 className="font-semibold">This project was cancelled</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Project work and contract details remain available below for
          reference.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Wallet className="h-4 w-4" /> Agreed amount
            </p>
            <p className="mt-1 font-semibold">
              PHP{" "}
              {project.budget.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-4 w-4" /> Delivery period
            </p>
            <p className="mt-1 font-semibold">
              {project.deliveryDays == null
                ? "Not set"
                : `${project.deliveryDays} days`}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <RotateCcw className="h-4 w-4" /> Revisions
            </p>
            <p className="mt-1 font-semibold">
              {project.revisions ?? "Not set"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Deadline</p>
            <p className="mt-1 font-semibold">
              {project.dueDate
                ? new Date(project.dueDate).toLocaleDateString()
                : "Not set"}
            </p>
          </div>
          {project.contractId && (
            <div className="border-t pt-4 sm:col-span-2 lg:col-span-4">
              <ContractSummary project={project} />
            </div>
          )}
        </CardContent>
      </Card>

      {project.projectId ? (
        <ProjectDeliveryPanel
          project={project}
          onRefresh={onRefresh}
          readOnly
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project work history</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            No project work was recorded.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
