"use client";

import * as React from "react";

import type { Project } from "@/components/project/ProjectCard";
import {
  getProjects,
  type ProjectRecord,
} from "@/services/project/projectService";

/* ==========================================================
   HELPERS
========================================================== */

function getRelatedRecord<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/* ==========================================================
   PROJECT TITLE
========================================================== */

function getProjectTitle(record: ProjectRecord): string {
  const project = getRelatedRecord(record.project);

  const service = getRelatedRecord(record.service);

  const projectRecord = project as Record<string, unknown> | null;

  const serviceRecord = service as Record<string, unknown> | null;

  return (
    (typeof projectRecord?.title === "string" ? projectRecord.title : null) ||
    (typeof serviceRecord?.title === "string" ? serviceRecord.title : null) ||
    "Untitled Project"
  );
}

/* ==========================================================
   CLIENT NAME
========================================================== */

function getClientName(record: ProjectRecord): string {
  const client = getRelatedRecord(record.client_profile);

  const clientRecord = client as Record<string, unknown> | null;

  const profile = getRelatedRecord(
    clientRecord?.profile as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | null
      | undefined,
  );

  const profileRecord = profile as Record<string, unknown> | null;

  if (
    typeof profileRecord?.display_name === "string" &&
    profileRecord.display_name.trim()
  ) {
    return profileRecord.display_name.trim();
  }

  const firstName =
    typeof profileRecord?.first_name === "string"
      ? profileRecord.first_name.trim()
      : "";

  const lastName =
    typeof profileRecord?.last_name === "string"
      ? profileRecord.last_name.trim()
      : "";

  const fullName = `${firstName} ${lastName}`.trim();

  if (fullName) {
    return fullName;
  }

  return "Client";
}

/* ==========================================================
   PROJECT TYPE
==========================================================

   Service type comes from:

   services.service_type

   Possible values:

   - standard
   - milestone
========================================================== */

function getProjectType(record: ProjectRecord): "Standard" | "Milestone" {
  const service = getRelatedRecord(record.service);

  const serviceRecord = service as Record<string, unknown> | null;

  return serviceRecord?.service_type === "milestone" ? "Milestone" : "Standard";
}

/* ==========================================================
   PROJECT BUDGET
==========================================================

   Priority:

   1. projects.budget
   2. contracts.final_price
   3. services.price
========================================================== */

function getBudget(record: ProjectRecord): number {
  const project = getRelatedRecord(record.project);

  const contract = getRelatedRecord(record.contract);

  const service = getRelatedRecord(record.service);

  const projectRecord = project as Record<string, unknown> | null;

  const contractRecord = contract as Record<string, unknown> | null;

  const serviceRecord = service as Record<string, unknown> | null;

  const budget =
    projectRecord?.budget ??
    contractRecord?.final_price ??
    serviceRecord?.price ??
    0;

  const numericBudget = Number(budget);

  return Number.isFinite(numericBudget) ? numericBudget : 0;
}

/* ==========================================================
   DUE DATE
==========================================================

   Priority:

   1. projects.due_date
   2. contracts.delivery_time_days

   services.delivery_time_days can be used as a
   fallback only if a project has not been created yet.
========================================================== */

function getDueDate(record: ProjectRecord): string | null {
  const project = getRelatedRecord(record.project);

  const contract = getRelatedRecord(record.contract);

  const service = getRelatedRecord(record.service);

  const projectRecord = project as Record<string, unknown> | null;

  const contractRecord = contract as Record<string, unknown> | null;

  const serviceRecord = service as Record<string, unknown> | null;

  /* --------------------------------------------------------
     Actual project due date
  -------------------------------------------------------- */

  const projectDueDate = projectRecord?.due_date;

  if (typeof projectDueDate === "string" && projectDueDate) {
    return projectDueDate;
  }

  /* --------------------------------------------------------
     Contract does not have a due_date column.
     It has delivery_time_days.

     We therefore calculate a projected due date
     from the order/project creation date.
  -------------------------------------------------------- */

  const deliveryDays = Number(
    contractRecord?.delivery_time_days ?? serviceRecord?.delivery_time_days,
  );

  if (Number.isFinite(deliveryDays) && deliveryDays >= 0) {
    const baseDate = new Date(record.created_at);

    if (!Number.isNaN(baseDate.getTime())) {
      baseDate.setDate(baseDate.getDate() + deliveryDays);

      return baseDate.toISOString();
    }
  }

  return null;
}

/* ==========================================================
   PROJECT PROGRESS
==========================================================

   Your current projects schema does NOT contain:

   projects.progress

   Therefore progress must be calculated from milestones.

   Completed milestones / total milestones * 100
========================================================== */

function getProgress(record: ProjectRecord): number {
  const milestones = record.milestones;

  if (!milestones) {
    return 0;
  }

  const milestoneArray = Array.isArray(milestones) ? milestones : [milestones];

  if (milestoneArray.length === 0) {
    return 0;
  }

  const completedCount = milestoneArray.filter((milestone) => {
    const milestoneRecord = milestone as Record<string, unknown>;

    return milestoneRecord.status === "completed";
  }).length;

  return Math.round((completedCount / milestoneArray.length) * 100);
}

/* ==========================================================
   MILESTONE COUNT
========================================================== */

function getMilestoneCount(record: ProjectRecord): number {
  const milestones = record.milestones;

  if (!milestones) {
    return 0;
  }

  if (Array.isArray(milestones)) {
    return milestones.length;
  }

  return 1;
}

/* ==========================================================
   PROJECT STATUS
========================================================== */

function getProjectStatus(record: ProjectRecord): Project["status"] {
  const project = getRelatedRecord(record.project);

  const contract = getRelatedRecord(record.contract);

  const projectRecord = project as Record<string, unknown> | null;

  const contractRecord = contract as Record<string, unknown> | null;

  const projectStatus = projectRecord?.status;

  const contractStatus = contractRecord?.status;

  /* --------------------------------------------------------
     Project status has priority once a project exists.
  -------------------------------------------------------- */

  if (typeof projectStatus === "string") {
    switch (projectStatus) {
      case "active":
        return "Active";

      case "completed":
        return "Completed";

      case "cancelled":
        return "Completed";

      case "pending":
        return "Request";

      default:
        break;
    }
  }

  /* --------------------------------------------------------
     Contract status
  -------------------------------------------------------- */

  if (typeof contractStatus === "string") {
    switch (contractStatus) {
      case "active":
        return "Active";

      case "completed":
        return "Completed";

      case "cancelled":
      case "rejected":
        return "Completed";

      case "negotiating":
      case "in_discussion":
        return "In Discussion";

      case "pending":
      case "draft":
      case "awaiting_client":
      case "awaiting_freelancer":
        return "Request";

      default:
        break;
    }
  }

  /* --------------------------------------------------------
     Service order status
  -------------------------------------------------------- */

  switch (record.status) {
    case "negotiating":
    case "in_discussion":
      return "In Discussion";

    case "pending":
      return "Request";

    case "accepted":
    case "active":
    case "in_progress":
    case "converted":
      return "Active";

    case "completed":
    case "cancelled":
    case "rejected":
      return "Completed";

    default:
      return "Request";
  }
}

/* ==========================================================
   MAP DATABASE RECORD → UI PROJECT
========================================================== */

function mapProject(record: ProjectRecord): Project {
  const project = getRelatedRecord(record.project) as Record<
    string,
    unknown
  > | null;

  return {
    orderId: record.order_id,
    projectId:
      typeof project?.project_id === "string" ? project.project_id : null,
    title: getProjectTitle(record),

    client: getClientName(record),

    type: getProjectType(record),

    budget: getBudget(record),

    createdAt: record.created_at,

    status: getProjectStatus(record),

    due: getDueDate(record),

    progress: getProgress(record),

    milestones: getMilestoneCount(record),
  };
}

/* ==========================================================
   HOOK
========================================================== */

export function useProjects() {
  const [projects, setProjects] = React.useState<Project[]>([]);

  const [loading, setLoading] = React.useState(true);

  const [error, setError] = React.useState<string | null>(null);

  /* ========================================================
     LOAD PROJECTS
  ======================================================== */

  const loadProjects = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const records = await getProjects();

      const mappedProjects = records.map(mapProject);

      setProjects(mappedProjects);
    } catch (err) {
      console.error("Failed to load projects:", err);

      setError(err instanceof Error ? err.message : "Failed to load projects.");

      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ========================================================
     INITIAL LOAD
  ======================================================== */

  React.useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  /* ========================================================
     RETURN
  ======================================================== */

  return {
    projects,
    loading,
    error,
    refetch: loadProjects,
  };
}
