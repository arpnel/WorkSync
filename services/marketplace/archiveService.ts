import { supabase } from "@/lib/supabaseClient";
import { invalidatePageReads } from "@/lib/pageReadCache";

export type ArchivedListing = { id: string; kind: "job" | "service"; title: string; description: string; createdAt: string; archivedAt: string | null; previousStatus: string };
export async function getArchivedListings(): Promise<ArchivedListing[]> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("Sign in to view archived listings.");
  const { data: role, error: roleError } = await supabase.from("Users").select("role").eq("user_id", auth.user.id).maybeSingle();
  if (roleError) throw roleError;
  let result: ArchivedListing[] = [];
  if (role?.role === "client") {
    const { data: owner, error } = await supabase.from("client_profiles").select("client_id").eq("user_id", auth.user.id).maybeSingle();
    if (error) throw error;
    if (!owner) return [];
    const { data, error: listingsError } = await supabase.from("jobs").select("job_id,title,description,created_at,updated_at,status").eq("client_id", owner.client_id).eq("is_archived", true).order("updated_at", { ascending: false });
    if (listingsError) throw listingsError;
    result = (data ?? []).map((row) => ({ id: row.job_id, kind: "job", title: row.title, description: row.description, createdAt: row.created_at, archivedAt: row.updated_at, previousStatus: String(row.status) }));
  } else if (role?.role === "freelancer") {
    const { data: owner, error } = await supabase.from("freelancer_profiles").select("freelancer_id").eq("user_id", auth.user.id).maybeSingle();
    if (error) throw error;
    if (!owner) return [];
    const { data, error: listingsError } = await supabase.from("services").select("service_id,title,description,created_at,updated_at,status").eq("freelancer_id", owner.freelancer_id).eq("is_archived", true).order("updated_at", { ascending: false });
    if (listingsError) throw listingsError;
    result = (data ?? []).map((row) => ({ id: row.service_id, kind: "service", title: row.title, description: row.description, createdAt: row.created_at, archivedAt: row.updated_at, previousStatus: String(row.status) }));
  }
  return result;
}
export async function restoreArchivedListing(item: ArchivedListing) {
  const table = item.kind === "job" ? "jobs" : "services";
  const key = item.kind === "job" ? "job_id" : "service_id";
  const { data, error } = await supabase.from(table).update({ is_archived: false }).eq(key, item.id).eq("is_archived", true).select(key).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This listing could not be restored. Check moderation and active listing limits.");
  invalidatePageReads();
}

