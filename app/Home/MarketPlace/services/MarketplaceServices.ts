import { supabase } from "@/lib/supabaseClient";

export async function getMarketplaceFreelancers() {
  const { data, error } = await supabase
    .from("Proposals")
    .select("*");

  if (error) {
    throw error;
  }

  return data;
}