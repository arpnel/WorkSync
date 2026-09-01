"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Plus,
} from "lucide-react";

import MilestoneCard, {
  type Milestone,
} from "./MilestoneCard";

interface MilestoneListProps {
  onMilestoneTotalChange?: (
    total: number
  ) => void;
}

const initialMilestones: Milestone[] = [
  {
    id: 1,
    title: "UI/UX Design",
    description:
      "Create the complete website wireframe and visual design.",
    budget: 4000,
    dueDate: "Aug 28, 2026",
    status: "Planning",
  },
  {
    id: 2,
    title: "Frontend Development",
    description:
      "Build the responsive frontend based on the approved design.",
    budget: 6000,
    dueDate: "Sep 7, 2026",
    status: "Planning",
  },
  {
    id: 3,
    title: "Backend & Integration",
    description:
      "Connect the backend, database, authentication, and APIs.",
    budget: 5000,
    dueDate: "Sep 15, 2026",
    status: "Planning",
  },
];

export default function MilestoneList({
  onMilestoneTotalChange,
}: MilestoneListProps) {
  const [milestones, setMilestones] =
    React.useState<Milestone[]>(
      initialMilestones
    );

  const milestoneTotal = React.useMemo(
    () =>
      milestones.reduce(
        (total, milestone) =>
          total + milestone.budget,
        0
      ),
    [milestones]
  );

  React.useEffect(() => {
    onMilestoneTotalChange?.(milestoneTotal);
  }, [
    milestoneTotal,
    onMilestoneTotalChange,
  ]);

  const addMilestone = () => {
    const newMilestone: Milestone = {
      id: Date.now(),
      title: `Milestone ${milestones.length + 1}`,
      description:
        "Describe the work that needs to be completed.",
      budget: 0,
      dueDate: "",
      status: "Planning",
    };

    setMilestones((current) => [
      ...current,
      newMilestone,
    ]);
  };

  const updateMilestone = (
    id: number,
    updates: Partial<Milestone>
  ) => {
    setMilestones((current) =>
      current.map((milestone) =>
        milestone.id === id
          ? {
              ...milestone,
              ...updates,
            }
          : milestone
      )
    );
  };

  const deleteMilestone = (id: number) => {
    setMilestones((current) =>
      current.filter(
        (milestone) => milestone.id !== id
      )
    );
  };

  return (
    <Card className="min-h-0 lg:min-h-[600px] xl:min-h-[680px]">
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">
              Project Milestones
            </CardTitle>

            <p className="mt-1 text-sm text-muted-foreground">
              Define the work, budget, and schedule.
            </p>
          </div>

          <Button
            size="sm"
            className="w-full gap-2 sm:w-auto"
            onClick={addMilestone}
          >
            <Plus className="h-4 w-4" />
            Add Milestone
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        {milestones.length > 0 ? (
          milestones.map((milestone, index) => (
            <MilestoneCard
              key={milestone.id}
              milestone={milestone}
              index={index}
              onUpdate={updateMilestone}
              onDelete={deleteMilestone}
            />
          ))
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="text-sm font-medium">
              No milestones yet
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              Add a milestone to start planning the
              project.
            </p>
          </div>
        )}

        <Button
          variant="outline"
          className="h-10 w-full gap-2 border-dashed"
          onClick={addMilestone}
        >
          <Plus className="h-4 w-4" />
          Add Another Milestone
        </Button>
      </CardContent>
    </Card>
  );
}