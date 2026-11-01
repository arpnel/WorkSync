import { supabase } from "@/lib/supabaseClient";
import { invalidatePageReads } from "@/lib/pageReadCache";
import { getActiveAccountContext } from "@/services/marketplace/AccountServices";
import type { ServiceType } from "@/services/serviceP/service.types";

export type ArchivedListing = { id: string; kind: "job" | "service"; title: string; description: string; createdAt: string; archivedAt: string | null; previousStatus: string; canRestore: boolean };
export type ArchivedJobRepostDraft = {
  title: string;
  description: string;
  categoryId: string;
  categoryText: string;
  budgetMin: number;
  budgetMax: number;
  pricingType: "fixed";
  serviceType: ServiceType;
  deadline: string;
  experienceLevel: "beginner" | "intermediate" | "expert";
  skillIds: string[];
};
export const ARCHIVED_LISTING_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function archivedListingCutoff(now = Date.now()) {
  return new Date(now - ARCHIVED_LISTING_RETENTION_MS).toISOString();
}

export async function getArchivedListings(): Promise<ArchivedListing[]> {
  const account = await getActiveAccountContext();
  if (!account.profileId) return [];
  const { data, error } = await supabase
    .from("listing_submissions")
    .select("listing_id,listing_type,title,description,created_at,archived_at,status")
    .eq("owner_id", account.userId)
    .eq("listing_type", account.role === "client" ? "job" : "service")
    .not("archived_at", "is", null)
    .gte("archived_at", archivedListingCutoff())
    .is("owner_removed_at", null)
    .order("archived_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []).filter((row) => row.listing_type === "job" || row.listing_type === "service");
  const jobIds = rows.filter((row) => row.listing_type === "job").map((row) => row.listing_id);
  const acceptedJobs = new Set<string>();
  if (jobIds.length) {
    const acceptedResult = await supabase
      .from("job_applications")
      .select("job_id")
      .in("job_id", jobIds)
      .eq("status", "accepted");
    if (acceptedResult.error) throw acceptedResult.error;
    for (const row of acceptedResult.data ?? []) acceptedJobs.add(row.job_id);
  }
  return rows.map((row) => ({
    id: row.listing_id,
    kind: row.listing_type as "job" | "service",
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    previousStatus: row.status === "approved" ? "Active" : row.status,
    canRestore: !acceptedJobs.has(row.listing_id),
  }));
}
export async function restoreArchivedListing(item: ArchivedListing) {
  const table = item.kind === "job" ? "jobs" : "services";
  const key = item.kind === "job" ? "job_id" : "service_id";
  const { data, error } = await supabase.from(table).update({ is_archived: false }).eq(key, item.id).eq("is_archived", true).select(key).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This listing could not be restored. Check moderation and active listing limits.");
  invalidatePageReads();
}

export async function getArchivedJobRepostDraft(jobId: string): Promise<ArchivedJobRepostDraft> {
  const { data: job, error } = await supabase
    .from("jobs")
    .select("job_id,category_id,title,description,budget_min,budget_max,experience_level,project_type")
    .eq("job_id", jobId)
    .eq("is_archived", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) throw new Error("This archived job is no longer available to repost.");

  const [categoryResult, skillsResult] = await Promise.all([
    supabase.from("job_categories").select("name").eq("id", job.category_id).maybeSingle(),
    supabase.from("job_skills").select("skill_id").eq("job_id", jobId),
  ]);
  if (categoryResult.error) throw new Error(categoryResult.error.message);
  if (skillsResult.error) throw new Error(skillsResult.error.message);

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const deadline = [
    nextWeek.getFullYear(),
    String(nextWeek.getMonth() + 1).padStart(2, "0"),
    String(nextWeek.getDate()).padStart(2, "0"),
  ].join("-");
  const experienceLevel = ["beginner", "intermediate", "expert"].includes(job.experience_level)
    ? job.experience_level as ArchivedJobRepostDraft["experienceLevel"]
    : "intermediate";
  return {
    title: job.title,
    description: job.description,
    categoryId: job.category_id,
    categoryText: categoryResult.data?.name ?? "",
    budgetMin: Number(job.budget_min),
    budgetMax: Number(job.budget_max),
    pricingType: "fixed",
    serviceType: job.project_type === "milestone" ? "milestone" : "standard",
    deadline,
    experienceLevel,
    skillIds: (skillsResult.data ?? []).map((row) => String(row.skill_id)),
  };
}

export async function removeArchivedListing(item: ArchivedListing) {
  const { error } = await supabase.rpc("worksync_remove_archived_listing", {
    p_kind: item.kind,
    p_listing: item.id,
  });
  if (error) throw new Error(error.message);
  invalidatePageReads();
}

