"use client";

import { readProjectCache } from "@/lib/projectReadCache";
import { projectProgress } from "@/lib/projectProgress";
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
  const contract = getRelatedRecord(record.contract) as Record<
    string,
    unknown
  > | null;
  let requestedTitle: string | null = null;
  if (typeof contract?.terms === "string") {
    try {
      const terms = JSON.parse(contract.terms) as Record<string, unknown>;
      requestedTitle =
        typeof terms.projectTitle === "string" ? terms.projectTitle : null;
    } catch {}
  }

  return (
    (typeof projectRecord?.title === "string" ? projectRecord.title : null) ||
    requestedTitle ||
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

  return "Profile unavailable";
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
  const project = getRelatedRecord(record.project) as Record<
    string,
    unknown
  > | null;
  return typeof project?.due_date === "string" ? project.due_date : null;
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
  const project = getRelatedRecord(record.project) as {
    project_submissions?: { kind?: string; attachment_path?: string | null }[];
  } | null;
  return projectProgress({
    completed: getProjectStatus(record) === "Completed",
    milestone: getProjectType(record) === "Milestone",
    milestones: (Array.isArray(record.milestones) ? record.milestones : []) as {
      status?: string;
    }[],
    submissions: project?.project_submissions ?? [],
  });
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

export function getProjectStatus(record: ProjectRecord): Project["status"] {
  const project = getRelatedRecord(record.project) as Record<
    string,
    unknown
  > | null;
  const status = String(project?.status ?? record.status).toLowerCase();
  if (
    ["cancelled", "canceled", "rejected"].includes(status) ||
    ["cancelled", "canceled", "rejected"].includes(record.status)
  )
    return "Cancelled";
  if (project?.status === "completed") return "Completed";
  if (["active", "in_progress", "revision"].includes(status)) return "Active";
  if (
    ["accepted", "negotiating", "in_discussion", "converted"].includes(
      record.status,
    )
  )
    return "In Discussion";
  return "Request";
}

/* ==========================================================
   MAP DATABASE RECORD → UI PROJECT
========================================================== */

export function mapProject(record: ProjectRecord): Project {
  const project = getRelatedRecord(record.project) as Record<
    string,
    unknown
  > | null;
  const contract = getRelatedRecord(record.contract) as Record<
    string,
    unknown
  > | null;
  const client = getRelatedRecord(record.client_profile) as Record<
    string,
    unknown
  > | null;
  const freelancer = getRelatedRecord(record.freelancer_profile) as Record<
    string,
    unknown
  > | null;
  let requestDescription: string | null = null;
  let requestCategoryName: string | null = null;
  if (typeof contract?.terms === "string") {
    try {
      const terms = JSON.parse(contract.terms) as Record<string, unknown>;
      requestDescription =
        typeof terms.description === "string"
          ? terms.description
          : contract.terms;
      requestCategoryName =
        typeof terms.categoryName === "string" ? terms.categoryName : null;
    } catch {
      requestDescription = contract.terms;
    }
  }

  return {
    orderId: record.order_id,
    applicationId: record.application_id ?? null,
    clientSignedAt:
      typeof contract?.client_signed_at === "string"
        ? contract.client_signed_at
        : null,
    freelancerSignedAt:
      typeof contract?.freelancer_signed_at === "string"
        ? contract.freelancer_signed_at
        : null,
    currentUserId: record.current_user_id,
    projectId:
      typeof project?.project_id === "string" ? project.project_id : null,
    title: getProjectTitle(record),

    client: getClientName(record),
    counterpartyName:
      record.current_user_id === client?.user_id
        ? getClientName({
            ...record,
            client_profile: record.freelancer_profile,
          })
        : getClientName(record),
    counterpartyUserId: String(
      (record.current_user_id === client?.user_id
        ? freelancer?.user_id
        : client?.user_id) ?? "",
    ),

    type: getProjectType(record),

    budget: getBudget(record),

    createdAt: record.created_at,

    status: getProjectStatus(record),

    due: getDueDate(record),

    progress: getProgress(record),

    milestones: getMilestoneCount(record),
    currentParty:
      freelancer?.user_id === record.current_user_id
        ? "freelancer"
        : client?.user_id === record.current_user_id
          ? "client"
          : null,
    requestDescription:
      typeof project?.description === "string"
        ? project.description
        : requestDescription,
    deliveryDays:
      typeof contract?.delivery_time_days === "number"
        ? contract.delivery_time_days
        : null,
    revisions:
      typeof contract?.revisions_count === "number"
        ? contract.revisions_count
        : null,
    requestCategoryName,
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

  const loadVersion = React.useRef(0);
  const loadProjects = React.useCallback(
    async (quiet = false, force = true) => {
      const version = ++loadVersion.current;
      try {
        if (!quiet) setLoading(true);
        setError(null);

        const records = await readProjectCache("projects", getProjects, force);
        if (version !== loadVersion.current) return;

        const mappedProjects = records.map(mapProject);

        setProjects(mappedProjects);
      } catch (err) {
        if (version !== loadVersion.current) return;
        console.error("Failed to load projects:", err);

        setError(
          err instanceof Error ? err.message : "Failed to load projects.",
        );

        if (!quiet) setProjects([]);
      } finally {
        if (version === loadVersion.current) setLoading(false);
      }
    },
    [],
  );

  /* ========================================================
     INITIAL LOAD
  ======================================================== */

  React.useEffect(() => {
    void loadProjects(false, false);
    const refresh = () => {
      if (document.visibilityState === "visible")
        void loadProjects(true, false);
    };
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
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
