import { supabase } from "@/lib/supabaseClient";

export async function getPostSigninPath(userId: string): Promise<string> {
  // Administrator access is provisioned separately from the client/freelancer
  // account role. A true admin membership should land in the admin workspace.
  const { data: isAdmin, error: adminError } = await supabase.rpc(
    "worksync_is_admin",
  );
  if (!adminError && isAdmin === true) return "/admin";

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("account_setup_completed")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return profile?.account_setup_completed
    ? "/home/marketplace"
    : "/account-setup";
}

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
  return getPostSigninPath(data.session.user.id);
}
