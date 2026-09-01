import { CalendarDays, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkspaceMilestone } from "@/types/project/projectWorkspace";

export function MilestoneWorkspaceList({
  milestones,
}: {
  milestones: WorkspaceMilestone[];
}) {
  const total = milestones.reduce(
    (sum, milestone) => sum + milestone.amount,
    0,
  );

  return (
    <Card className="min-h-[520px]">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4" />
            Milestones
          </CardTitle>
          <Badge variant="secondary">{milestones.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {milestones.length ? (
          milestones.map((milestone, index) => (
            <article key={milestone.id} className="rounded-md border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    Milestone {index + 1}
                  </p>
                  <h3 className="mt-1 font-medium">{milestone.title}</h3>
                </div>
                <Badge variant="outline" className="capitalize">
                  {milestone.status}
                </Badge>
              </div>
              {milestone.description && (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {milestone.description}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                <strong>PHP {milestone.amount.toLocaleString()}</strong>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="h-4 w-4" />
                  {milestone.dueDate
                    ? new Date(milestone.dueDate).toLocaleDateString()
                    : "No due date"}
                </span>
              </div>
            </article>
          ))
        ) : (
          <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
            No milestones have been created.
          </div>
        )}
        {milestones.length > 0 && (
          <div className="flex justify-between border-t pt-4 text-sm">
            <span className="text-muted-foreground">Milestone total</span>
            <strong>PHP {total.toLocaleString()}</strong>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
