"use client";

import * as React from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface PlanningStatusProps {
  milestoneCount: number;
  plannedCount?: number;
}

export default function PlanningStatus({
  milestoneCount,
  plannedCount,
}: PlanningStatusProps) {
  const completed =
    plannedCount ?? milestoneCount;

  const progress =
    milestoneCount > 0
      ? Math.min(
          100,
          Math.round(
            (completed / milestoneCount) * 100
          )
        )
      : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Planning Status
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Milestones planned
          </span>

          <span className="font-medium">
            {milestoneCount}
          </span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Adjust the budget, duration, and milestones
          until both parties agree.
        </p>
      </CardContent>
    </Card>
  );
}