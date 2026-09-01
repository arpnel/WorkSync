"use client";

import * as React from "react";

export interface Milestone {
  id: number;
  title: string;
  description: string;
  budget: number;
  dueDate: string;
  status: string;
}

const INITIAL_MILESTONES: Milestone[] = [
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

export interface UseProjectMilestonesReturn {
  milestones: Milestone[];

  projectBudget: number;
  duration: number;

  milestoneTotal: number;
  budgetDifference: number;

  setProjectBudget: (
    value: number
  ) => void;

  setDuration: (
    value: number
  ) => void;

  addMilestone: () => Milestone;

  updateMilestone: (
    milestoneId: number,
    updates: Partial<Milestone>
  ) => void;

  deleteMilestone: (
    milestoneId: number
  ) => void;

  getMilestone: (
    milestoneId: number
  ) => Milestone | undefined;

  resetMilestones: () => void;
}

export function useProjectMilestones(): UseProjectMilestonesReturn {
  const [milestones, setMilestones] =
    React.useState<Milestone[]>(
      INITIAL_MILESTONES
    );

  const [projectBudget, setProjectBudgetState] =
    React.useState(15000);

  const [duration, setDurationState] =
    React.useState(25);

  const milestoneTotal = React.useMemo(() => {
    return milestones.reduce(
      (total, milestone) =>
        total + milestone.budget,
      0
    );
  }, [milestones]);

  const budgetDifference =
    projectBudget - milestoneTotal;

  const setProjectBudget = React.useCallback(
    (value: number) => {
      setProjectBudgetState(
        Math.max(0, value)
      );
    },
    []
  );

  const setDuration = React.useCallback(
    (value: number) => {
      setDurationState(
        Math.max(1, value)
      );
    },
    []
  );

  const addMilestone =
    React.useCallback(() => {
      const newMilestone: Milestone = {
        id: Date.now(),
        title: `Milestone ${
          milestones.length + 1
        }`,
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

      return newMilestone;
    }, [milestones.length]);

  const updateMilestone =
    React.useCallback(
      (
        milestoneId: number,
        updates: Partial<Milestone>
      ) => {
        setMilestones((current) =>
          current.map((milestone) =>
            milestone.id === milestoneId
              ? {
                  ...milestone,
                  ...updates,
                }
              : milestone
          )
        );
      },
      []
    );

  const deleteMilestone =
    React.useCallback(
      (milestoneId: number) => {
        setMilestones((current) =>
          current.filter(
            (milestone) =>
              milestone.id !== milestoneId
          )
        );
      },
      []
    );

  const getMilestone =
    React.useCallback(
      (milestoneId: number) => {
        return milestones.find(
          (milestone) =>
            milestone.id === milestoneId
        );
      },
      [milestones]
    );

  const resetMilestones =
    React.useCallback(() => {
      setMilestones(
        INITIAL_MILESTONES.map(
          (milestone) => ({
            ...milestone,
          })
        )
      );

      setProjectBudgetState(15000);
      setDurationState(25);
    }, []);

  return {
    milestones,

    projectBudget,
    duration,

    milestoneTotal,
    budgetDifference,

    setProjectBudget,
    setDuration,

    addMilestone,
    updateMilestone,
    deleteMilestone,

    getMilestone,
    resetMilestones,
  };
}

export default useProjectMilestones;