"use client";

import * as React from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { Wallet } from "lucide-react";

interface ProjectTermsProps {
  milestoneTotal: number;
  projectBudget: number;
  onProjectBudgetChange: (
    value: number
  ) => void;
  duration: number;
  onDurationChange: (
    value: number
  ) => void;
}

export default function ProjectTerms({
  milestoneTotal,
  projectBudget,
  onProjectBudgetChange,
  duration,
  onDurationChange,
}: ProjectTermsProps) {
  const budgetDifference =
    projectBudget - milestoneTotal;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" />
          Project Terms
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium">
            Total Budget
          </label>

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              ₱
            </span>

            <Input
              type="number"
              min={0}
              value={projectBudget}
              onChange={(event) =>
                onProjectBudgetChange(
                  Number(event.target.value)
                )
              }
              className="pl-7 text-lg font-semibold"
            />
          </div>

          {projectBudget !== milestoneTotal && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Milestones currently total ₱
              {milestoneTotal.toLocaleString()}.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium">
            Proposed Duration
          </label>

          <div className="relative">
            <Input
              type="number"
              min={1}
              value={duration}
              onChange={(event) =>
                onDurationChange(
                  Math.max(
                    1,
                    Number(event.target.value)
                  )
                )
              }
              className="pr-14"
            />

            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              days
            </span>
          </div>

          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            The project clock starts only after both
            parties accept the agreement.
          </p>
        </div>

        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              Milestone total
            </span>

            <span className="font-medium">
              ₱{milestoneTotal.toLocaleString()}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              Proposed budget
            </span>

            <span className="font-medium">
              ₱{projectBudget.toLocaleString()}
            </span>
          </div>

          {budgetDifference !== 0 && (
            <div className="mt-2 border-t pt-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">
                  Unallocated
                </span>

                <span className="font-medium">
                  ₱{budgetDifference.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}