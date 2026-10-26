import { supabase } from "@/lib/supabaseClient";
import { invalidatePageReads } from "@/lib/pageReadCache";
import { getActiveAccountContext } from "@/services/marketplace/AccountServices";

export type ArchivedListing = { id: string; kind: "job" | "service"; title: string; description: string; createdAt: string; archivedAt: string | null; previousStatus: string; canRestore: boolean };
export async function getArchivedListings(): Promise<ArchivedListing[]> {
  const account = await getActiveAccountContext();
  if (!account.profileId) return [];
  const { data, error } = await supabase
    .from("listing_submissions")
    .select("listing_id,listing_type,title,description,created_at,archived_at,status")
    .eq("owner_id", account.userId)
    .eq("listing_type", account.role === "client" ? "job" : "service")
    .not("archived_at", "is", null)
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

export async function removeArchivedListing(item: ArchivedListing) {
  const { error } = await supabase.rpc("worksync_remove_archived_listing", {
    p_kind: item.kind,
    p_listing: item.id,
  });
  if (error) throw new Error(error.message);
  invalidatePageReads();
}

