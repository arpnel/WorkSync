import { supabase } from "@/lib/supabaseClient";
export async function updatePasswordOnServer(password: string, currentPassword?: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("Sign in to change your password.");
  const response = await fetch("/api/auth/password", { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: currentPassword ? "change" : "reset", currentPassword, password }) });
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(result?.error ?? "Unable to change your password.");
}
