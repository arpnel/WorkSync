import { CalendarDays, RotateCcw, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";

export function StandardProjectSummary({
  project,
}: {
  project: ProjectWorkspace;
}) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet className="h-4 w-4" />
              Budget
            </span>
            <strong>PHP {project.budget.toLocaleString()}</strong>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              Deadline
            </span>
            <span className="text-sm font-medium">
              {project.dueDate
                ? new Date(project.dueDate).toLocaleDateString()
                : "Not set"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <RotateCcw className="h-4 w-4" />
              Revisions
            </span>
            <span className="text-sm font-medium">
              {project.revisions ?? "Not set"}
            </span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agreement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium capitalize">
              {project.contractStatus ?? "Pending"}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Client</span>
            <span>{project.clientSignedAt ? "Signed" : "Pending"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Freelancer</span>
            <span>{project.freelancerSignedAt ? "Signed" : "Pending"}</span>
          </div>
          {project.terms && (
            <p className="border-t pt-3 leading-6 text-muted-foreground">
              {project.terms}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
