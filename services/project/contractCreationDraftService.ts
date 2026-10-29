import { supabase } from "@/lib/supabaseClient";

export async function loadContractCreationDraft(
  draftKey: string,
  userId: string,
): Promise<unknown | null> {
  const { data, error } = await supabase
    .from("contract_creation_drafts")
    .select("draft")
    .eq("draft_key", draftKey)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load saved contract draft: ${error.message}`);
  return data?.draft ?? null;
}

export async function saveContractCreationDraft(
  draftKey: string,
  userId: string,
  draft: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("contract_creation_drafts")
    .upsert(
      {
        draft_key: draftKey,
        user_id: userId,
        draft,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,draft_key" },
    );
  if (error) throw new Error(`Unable to save contract draft: ${error.message}`);
}

export async function deleteContractCreationDraft(
  draftKey: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("contract_creation_drafts")
    .delete()
    .eq("draft_key", draftKey)
    .eq("user_id", userId);
  if (error) throw new Error(`Unable to clear saved contract draft: ${error.message}`);
}
