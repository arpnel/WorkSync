export type ContractStatus =
  | "draft"
  | "pending"
  | "pending_client"
  | "pending_freelancer"
  | "active"
  | "rejected"
  | "cancelled"
  | "completed";
export type ServiceOrderStatus =
  | "pending"
  | "active"
  | "accepted"
  | "converted"
  | "completed"
  | "cancelled"
  | "rejected";
export type ProjectStatus =
  | "pending"
  | "active"
  | "revision"
  | "completed"
  | "cancelled";
export type MilestoneStatus =
  | "pending"
  | "in_progress"
  | "submitted"
  | "revision_requested"
  | "approved"
  | "overdue";
export type VerificationStatus = "pending" | "approved" | "rejected";
export function workspaceStatus(
  project: string | null,
  contract: string | null,
  order: string,
  clientSigned: string | null,
  freelancerSigned: string | null,
): string {
  if (
    project === "cancelled" ||
    order === "cancelled" ||
    contract === "cancelled"
  )
    return "cancelled";
  if (project === "completed") return "completed";
  if (contract === "rejected" || order === "rejected") return "rejected";
  if (
    clientSigned &&
    freelancerSigned &&
    contract === "active" &&
    (project === "active" ||
      project === "in_progress" ||
      project === "revision")
  )
    return project === "in_progress" ? "active" : project;
  if (clientSigned && freelancerSigned) return "Awaiting activation";
  if (contract === "pending_client") return "Awaiting client confirmation";
  if (contract === "pending_freelancer")
    return "Awaiting freelancer confirmation";
  if (clientSigned) return "Awaiting freelancer confirmation";
  if (freelancerSigned) return "Awaiting client confirmation";
  return "Pending agreement";
}

function parseStatus<T extends string>(
  value: string,
  allowed: readonly T[],
): T {
  if (!allowed.includes(value as T))
    throw new Error("Unsupported database status: " + value);
  return value as T;
}
export const contractStatus = (value: string): ContractStatus =>
  parseStatus(value, [
    "draft",
    "pending",
    "pending_client",
    "pending_freelancer",
    "active",
    "rejected",
    "cancelled",
    "completed",
  ]);
export const orderStatus = (value: string): ServiceOrderStatus =>
  parseStatus(value, [
    "pending",
    "active",
    "accepted",
    "converted",
    "completed",
    "cancelled",
    "rejected",
  ]);
export const milestoneStatus = (value: string): MilestoneStatus =>
  parseStatus(value === "completed" ? "approved" : value, [
    "pending",
    "in_progress",
    "submitted",
    "revision_requested",
    "approved",
    "overdue",
  ]);
