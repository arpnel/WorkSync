import { supabase } from "@/lib/supabaseClient";

import { DEFAULT_ROLE } from "./constants";
import { CreateAccountData } from "./types";

export async function createAccount({
  email,
  password,
  firstName,
  lastName,
}: CreateAccountData) {
  const cleanEmail = email.trim().toLowerCase();

  let authData;
  let authError;

  try {
    const result = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          role: DEFAULT_ROLE,
        },
      },
    });

    authData = result.data;
    authError = result.error;
  } catch (e) {
    console.error("SIGNUP THREW:", e);
    throw e;
  }

  if (authError) {
    const message = authError.message.toLowerCase();

    if (
      message.includes("already") ||
      message.includes("registered") ||
      message.includes("exists")
    ) {
      throw new Error("ACCOUNT_EXISTS");
    }

    throw authError;
  }

  if (!authData.user) {
    throw new Error("Failed to create account.");
  }

  return authData.user;
}