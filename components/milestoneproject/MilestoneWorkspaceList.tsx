"use client";

import { CalendarDays, Check, ListChecks, X } from "lucide-react";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { RemoveDraftMilestone } from "@/components/project/MilestonePlanningForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";

type Props = {
  planning?: ReactNode;
  onRefresh?: () => Promise<void>;
  project: ProjectWorkspace;
  updatingApprovalKey: string | null;
  onRespondItem: (itemKey: string, approved: boolean) => Promise<boolean>;
};

export function MilestoneWorkspaceList({
  project,
  updatingApprovalKey,
  onRespondItem,
  planning,
  onRefresh,
}: Props) {
  const total = project.milestones.reduce(
    (sum, milestone) => sum + milestone.amount,
    0,
  );
  const approvalMap = new Map(
    project.agreementItems.map((item) => [item.itemKey, item]),
  );
  const budget = approvalMap.get("budget");
  const budgetAgreed = Boolean(
    budget?.clientApprovedAt && budget.freelancerApprovedAt,
  );

  const respond = async (itemKey: string, approved: boolean) => {
    const saved = await onRespondItem(itemKey, approved);
    toast[saved ? "success" : "error"](
      saved
        ? approved
          ? "Milestone approval recorded."
          : "Both milestone approvals were reset."
        : "The milestone approval could not be updated. Please try again.",
    );
  };

  return (
    <Card>
      <CardHeader className="border-b px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4" />
            Milestone Agreements
          </CardTitle>
          <div className="flex items-center gap-2">
            <fieldset disabled={!budgetAgreed}>{planning}</fieldset>
            <Badge variant="secondary">{project.milestones.length}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {!budgetAgreed && (
          <p role="status" className="rounded-lg bg-muted p-3 text-sm">
            First, both participants must agree on the budget in Contract
            Approvals. Then you can add and agree on milestones.
          </p>
        )}
        {project.milestones.length ? (
          <div
            role="region"
            aria-label="Milestone agreements list"
            tabIndex={0}
            className="max-h-[65dvh] space-y-2 overflow-y-auto overscroll-contain rounded-md pr-2 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring [scrollbar-gutter:stable]"
          >
            {project.milestones.map((milestone, index) => {
              const itemKey = `milestone:${milestone.id}`;
              const approval = approvalMap.get(itemKey);
              const clientApproved = Boolean(approval?.clientApprovedAt);
              const freelancerApproved = Boolean(
                approval?.freelancerApprovedAt,
              );
              const mineApproved =
                project.currentParty === "client"
                  ? clientApproved
                  : freelancerApproved;
              const updating = updatingApprovalKey === itemKey;

              return (
                <article key={milestone.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-medium">
                        <span className="mr-2 text-muted-foreground">
                          {index + 1}.
                        </span>
                        {milestone.title}
                      </h3>
                    </div>
                    <strong className="shrink-0 text-sm">
                      PHP {milestone.amount.toLocaleString()}
                    </strong>
                  </div>

                  {milestone.description && (
                    <details className="mt-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Description</summary>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5">
                        {milestone.description}
                      </p>
                    </details>
                  )}

                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {milestone.dueDate
                      ? new Date(milestone.dueDate).toLocaleDateString()
                      : "No due date"}
                  </div>

                  <div className="mt-2 flex flex-wrap justify-between gap-2 border-t pt-2 text-xs">
                    <span>Client: {clientApproved ? "Agreed" : "Waiting"}</span>
                    <span className="text-right">
                      Freelancer: {freelancerApproved ? "Agreed" : "Waiting"}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={mineApproved ? "secondary" : "outline"}
                      disabled={updating || mineApproved || !budgetAgreed}
                      onClick={() => void respond(itemKey, true)}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {mineApproved ? "Agreed" : "Agree"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={updating}
                      onClick={() => void respond(itemKey, false)}
                    >
                      <X className="h-3.5 w-3.5" />
                      Disagree
                    </Button>
                    {onRefresh && budgetAgreed && (
                      <RemoveDraftMilestone
                        orderId={project.orderId}
                        id={milestone.id}
                        onRefresh={onRefresh}
                        compact
                      />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
            Add your first milestone to agree on its scope, amount, and
            deadline.
          </div>
        )}

        {project.milestones.length > 0 && (
          <div className="flex justify-between border-t pt-4 text-sm">
            <span className="text-muted-foreground">Milestone total</span>
            <strong>PHP {total.toLocaleString()}</strong>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
