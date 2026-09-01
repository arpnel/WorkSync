"use client";

import { CalendarDays, Check, ListChecks, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";

type Props = {
  project: ProjectWorkspace;
  updatingApprovalKey: string | null;
  onRespondItem: (itemKey: string, approved: boolean) => Promise<boolean>;
};

export function MilestoneWorkspaceList({
  project,
  updatingApprovalKey,
  onRespondItem,
}: Props) {
  const total = project.milestones.reduce(
    (sum, milestone) => sum + milestone.amount,
    0,
  );
  const approvalMap = new Map(
    project.agreementItems.map((item) => [item.itemKey, item]),
  );

  const respond = async (itemKey: string, approved: boolean) => {
    const saved = await onRespondItem(itemKey, approved);
    toast[saved ? "success" : "error"](
      saved
        ? approved
          ? "Milestone approval recorded."
          : "Both milestone approvals were reset."
        : "Run the Supabase individual-approval migration first.",
    );
  };

  return (
    <Card className="min-h-[700px]">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4" />
            Milestone Agreements
          </CardTitle>
          <Badge variant="secondary">{project.milestones.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {project.milestones.length ? (
          project.milestones.map((milestone, index) => {
            const itemKey = `milestone:${milestone.id}`;
            const approval = approvalMap.get(itemKey);
            const clientApproved = Boolean(approval?.clientApprovedAt);
            const freelancerApproved = Boolean(approval?.freelancerApprovedAt);
            const mineApproved =
              project.currentParty === "client"
                ? clientApproved
                : freelancerApproved;
            const updating = updatingApprovalKey === itemKey;

            return (
              <article key={milestone.id} className="rounded-md border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      Milestone {index + 1}
                    </p>
                    <h3 className="mt-1 font-medium">{milestone.title}</h3>
                  </div>
                  <strong className="shrink-0 text-sm">
                    PHP {milestone.amount.toLocaleString()}
                  </strong>
                </div>

                {milestone.description && (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {milestone.description}
                  </p>
                )}

                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {milestone.dueDate
                    ? new Date(milestone.dueDate).toLocaleDateString()
                    : "No due date"}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-3 text-xs">
                  <span>Client: {clientApproved ? "Agreed" : "Waiting"}</span>
                  <span className="text-right">
                    Freelancer: {freelancerApproved ? "Agreed" : "Waiting"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={mineApproved ? "secondary" : "outline"}
                    disabled={updating || mineApproved}
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
                </div>
              </article>
            );
          })
        ) : (
          <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
            No milestones have been created.
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
