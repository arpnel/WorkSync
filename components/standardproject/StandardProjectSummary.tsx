import { CalendarDays, RotateCcw, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectAgreementCard } from "@/components/project/ProjectAgreementCard";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";

type Props = {
  project: ProjectWorkspace;
  updatingAgreement: boolean;
  updatingApprovalKey: string | null;
  onRespond: (accepted: boolean) => Promise<boolean>;
  onRespondItem: (itemKey: string, approved: boolean) => Promise<boolean>;
  onSaveTerms: (budget: number, deliveryDays: number) => Promise<boolean>;
};

export function StandardProjectSummary({
  project,
  updatingAgreement,
  updatingApprovalKey,
  onRespond,
  onRespondItem,
  onSaveTerms,
}: Props) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Contract Agreement</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the current terms before both parties confirm.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
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
                Delivery
              </span>
              <span className="text-sm font-medium">
                {project.deliveryDays == null
                  ? "Not set"
                  : `${project.deliveryDays} days`}
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
            <div className="flex items-center justify-between gap-4 border-t pt-4">
              <span className="text-sm text-muted-foreground">Deadline</span>
              <span className="text-sm font-medium">
                {project.dueDate
                  ? new Date(project.dueDate).toLocaleDateString()
                  : "Not set"}
              </span>
            </div>
          </CardContent>
        </Card>

        <ProjectAgreementCard
          project={project}
          updating={updatingAgreement}
          updatingApprovalKey={updatingApprovalKey}
          onRespond={onRespond}
          onRespondItem={onRespondItem}
          onSaveTerms={onSaveTerms}
        />
      </div>
    </section>
  );
}
