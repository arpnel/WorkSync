import { supabase } from "@/lib/supabaseClient";

import { LoginData } from "./types";

/**
 * Email & Password Sign In
 */
export async function login({
  email,
  password,
}: LoginData) {
  const cleanEmail = email.trim().toLowerCase();

  const { data, error } =
    await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

  if (error) {
    const message = error.message.toLowerCase();

    if (
      message.includes("invalid login credentials") ||
      message.includes("invalid credentials")
    ) {
      throw new Error("INVALID_CREDENTIALS");
    }

    if (
      message.includes("email not confirmed") ||
      message.includes("not confirmed")
    ) {
      throw new Error("EMAIL_NOT_VERIFIED");
    }

    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error("LOGIN_FAILED");
  }

  return data.user;
}

/**
 * Google Sign In
 */
export async function loginWithGoogle() {
  const { error } =
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Change this later for production
        redirectTo:
          `${window.location.origin}/auth/callback`,
      },
    });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Sign Out
 */
export async function logout() {
  const { error } =
    await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }
}