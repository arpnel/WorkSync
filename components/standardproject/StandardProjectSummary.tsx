import { CalendarDays, RotateCcw, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectAgreementCard } from "@/components/project/ProjectAgreementCard";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";

type Props = {
  project: ProjectWorkspace;
  updatingAgreement: boolean;
  onRespond: (accepted: boolean) => Promise<boolean>;
  onSaveTerms: (budget: number, deliveryDays: number) => Promise<boolean>;
};

export function StandardProjectSummary({
  project,
  updatingAgreement,
  onRespond,
  onSaveTerms,
}: Props) {
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
      <ProjectAgreementCard
        project={project}
        updating={updatingAgreement}
        onRespond={onRespond}
        onSaveTerms={onSaveTerms}
      />
    </div>
  );
}
