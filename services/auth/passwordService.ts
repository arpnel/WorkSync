import { supabase } from "@/lib/supabaseClient";

type PasswordActionResult = { error?: string } | null;

async function authorizedRequest(
  body: Record<string, string>,
  fallback: string,
): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session)
    throw new Error("Sign in to update your account security settings.");

  const response = await fetch("/api/auth/password", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as PasswordActionResult;
  if (!response.ok) throw new Error(result?.error ?? fallback);
}

export function updatePasswordOnServer(
  password: string,
  currentPassword?: string,
  nonce?: string,
): Promise<void> {
  return authorizedRequest(
    {
      action: currentPassword ? "change" : nonce ? "set_password" : "reset",
      password,
      ...(currentPassword ? { currentPassword } : {}),
      ...(nonce ? { nonce } : {}),
    },
    "Unable to change your password.",
  );
}

export function changeEmailOnServer(
  email: string,
  currentPassword?: string,
  nonce?: string,
): Promise<void> {
  return authorizedRequest(
    {
      action: currentPassword ? "change_email" : "change_email_verified",
      email,
      ...(currentPassword ? { currentPassword } : {}),
      ...(nonce ? { nonce } : {}),
    },
    "Unable to request an email change.",
  );
}

export async function requestSecurityReauthentication(): Promise<void> {
  const { error } = await supabase.auth.reauthenticate();
  if (error) throw error;
}
