import { supabase } from "@/lib/supabaseClient";

export async function completeSignin(href: string): Promise<string> {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (url.searchParams.has("error") || fragment.has("error")) {
    throw new Error(
      "Sign-in was cancelled or the link expired. Please try again.",
    );
  }
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session)
    throw new Error(
      "Unable to complete sign-in. Please request a new link or sign in again.",
    );
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("account_setup_completed")
    .eq("user_id", data.session.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  return profile?.account_setup_completed
    ? "/home/marketplace"
    : "/account-setup";
}
