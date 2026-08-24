"use client";

import * as React from "react";

import type { Project } from "@/components/project/ProjectCard";
import {
  getProjects,
  type ProjectRecord,
} from "@/services/project/projectService";

function getRelatedRecord<T>(
  value: T | T[] | null | undefined
): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value)
    ? value[0] ?? null
    : value;
}

function getProjectTitle(record: ProjectRecord) {
  const listing = getRelatedRecord(
    record.marketplace_listing
  );

  const project = getRelatedRecord(
    record.project
  );

  const listingRecord =
    listing as Record<string, unknown> | null;

  const projectRecord =
    project as Record<string, unknown> | null;

  return (
    (projectRecord?.title as string) ||
    (listingRecord?.title as string) ||
    "Untitled Project"
  );
}

function getClientName(record: ProjectRecord) {
  const client = getRelatedRecord(
    record.client_profile
  );

  const clientRecord =
    client as Record<string, unknown> | null;

  return (
    (clientRecord?.display_name as string) ||
    (clientRecord?.full_name as string) ||
    (clientRecord?.name as string) ||
    "Client"
  );
}

function getProjectType(record: ProjectRecord) {
  const contract = getRelatedRecord(
    record.contract
  );

  const contractRecord =
    contract as Record<string, unknown> | null;

  const project = getRelatedRecord(
    record.project
  );

  const projectRecord =
    project as Record<string, unknown> | null;

  const listing = getRelatedRecord(
    record.marketplace_listing
  );

  const listingRecord =
    listing as Record<string, unknown> | null;

  const type =
    projectRecord?.type ??
    contractRecord?.type ??
    listingRecord?.service_type;

  return type === "milestone"
    ? "Milestone"
    : "Standard";
}

function getBudget(record: ProjectRecord) {
  const contract = getRelatedRecord(
    record.contract
  );

  const contractRecord =
    contract as Record<string, unknown> | null;

  const project = getRelatedRecord(
    record.project
  );

  const projectRecord =
    project as Record<string, unknown> | null;

  const listing = getRelatedRecord(
    record.marketplace_listing
  );

  const listingRecord =
    listing as Record<string, unknown> | null;

  const budget =
    projectRecord?.budget ??
    contractRecord?.budget ??
    listingRecord?.price ??
    0;

  const numericBudget = Number(budget);

  return Number.isFinite(numericBudget)
    ? numericBudget
    : 0;
}

function getDueDate(record: ProjectRecord) {
  const project = getRelatedRecord(
    record.project
  );

  const projectRecord =
    project as Record<string, unknown> | null;

  const contract = getRelatedRecord(
    record.contract
  );

  const contractRecord =
    contract as Record<string, unknown> | null;

  const due =
    projectRecord?.due_date ??
    projectRecord?.deadline ??
    contractRecord?.due_date ??
    contractRecord?.deadline ??
    null;

  if (!due) {
    return null;
  }

  if (
    typeof due === "string" &&
    due.startsWith("Due ")
  ) {
    return due;
  }

  return String(due);
}

function getProgress(record: ProjectRecord) {
  const project = getRelatedRecord(
    record.project
  );

  const projectRecord =
    project as Record<string, unknown> | null;

  const progress = Number(
    projectRecord?.progress ?? 0
  );

  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, progress)
  );
}

function getMilestoneCount(
  _record: ProjectRecord
) {
  return 0;
}

function mapProject(
  record: ProjectRecord
): Project {
  let status: Project["status"];

  switch (record.status) {
    case "pending":
      status = "Request";
      break;

    case "accepted":
      status = "Active";
      break;

    case "rejected":
    case "cancelled":
      status = "Completed";
      break;

    case "converted":
      status = "Active";
      break;

    default:
      status = "Request";
  }

  return {
    title: getProjectTitle(record),

    client: getClientName(record),

    type: getProjectType(record),

    budget: getBudget(record),

    createdAt: record.created_at,

    status,

    due: getDueDate(record),

    progress: getProgress(record),

    milestones:
      getMilestoneCount(record),
  };
}

export function useProjects() {
  const [projects, setProjects] =
    React.useState<Project[]>([]);

  const [loading, setLoading] =
    React.useState(true);

  const [error, setError] =
    React.useState<string | null>(null);

  const loadProjects =
    React.useCallback(async () => {
      try {
        setLoading(true);
        setError(null);

        const records =
          await getProjects();

        const mappedProjects =
          records.map(mapProject);

        setProjects(mappedProjects);
      } catch (err) {
        console.error(
          "Failed to load projects:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load projects."
        );

        setProjects([]);
      } finally {
        setLoading(false);
      }
    }, []);

  React.useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return {
    projects,
    loading,
    error,
    refetch: loadProjects,
  };
}