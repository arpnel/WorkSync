import { supabase } from "@/lib/supabaseClient";

export const FULLY_BOOKED_MESSAGE =
  "This freelancer is fully booked. New work is unavailable until a project slot opens.";

export function parseAvailability(value: unknown): Map<string, boolean> {
  if (!Array.isArray(value)) throw new Error("Availability could not be checked.");
  const result = new Map<string, boolean>();
  for (const row of value) {
    if (!row || typeof row.freelancer_id !== "string" || typeof row.available !== "boolean")
      throw new Error("Availability could not be checked.");
    result.set(row.freelancer_id, row.available);
  }
  return result;
}

export async function getFreelancerAvailability(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const result = new Map<string, boolean>();
  for (let index = 0; index < unique.length; index += 200) {
    const { data, error } = await supabase.rpc("worksync_freelancer_availability", {
      p_freelancers: unique.slice(index, index + 200),
    });
    if (error) throw new Error("Availability could not be checked. Please try again shortly.");
    for (const [id, available] of parseAvailability(data)) result.set(id, available);
  }
  return result;
}

export async function assertFreelancerAvailable(id: string) {
  const available = (await getFreelancerAvailability([id])).get(id);
  if (available === false) throw new Error(FULLY_BOOKED_MESSAGE);
  if (available !== true) throw new Error("Availability could not be checked. Please try again shortly.");
}

export async function getOwnFreelancerId(): Promise<string | null> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) return null;
  const result = await supabase.from("freelancer_profiles").select("freelancer_id").eq("user_id", user.id).maybeSingle();
  if (result.error) throw result.error;
  return result.data?.freelancer_id ?? null;
}
