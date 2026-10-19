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
): Promise<void> {
  return authorizedRequest(
    {
      action: currentPassword ? "change" : "reset",
      password,
      ...(currentPassword ? { currentPassword } : {}),
    },
    "Unable to change your password.",
  );
}

export function changeEmailOnServer(
  email: string,
  currentPassword: string,
): Promise<void> {
  return authorizedRequest(
    { action: "change_email", email, currentPassword },
    "Unable to request an email change.",
  );
}