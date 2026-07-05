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
  });

  console.log("SIGNUP RESULT:", result);

  authData = result.data;
  authError = result.error;
} catch (e) {
  console.error("SIGNUP THREW:", e);
  console.dir(e);
  throw e;
}
console.log("authData:", authData);
console.log("authError:", authError);

  if (authError) {
    const message = authError.message.toLowerCase();

    if (
      message.includes("already") ||
      message.includes("registered") ||
      message.includes("exists")
    ) {
      throw new Error("ACCOUNT_EXISTS");
    }

    if (authError) {
      console.error("Auth error:", authError);
      throw authError;
    }
  }

  const user = authData.user;

  if (!user) {
    throw new Error("Failed to create account.");
  }

  const { error: profileError } = await supabase
    .from("Users")
    .insert({
      user_id: user.id,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: cleanEmail,
      role: DEFAULT_ROLE,
    });

  if (profileError) {
    const message = profileError.message.toLowerCase();

    if (
      message.includes("duplicate") ||
      message.includes("unique")
    ) {
      throw new Error("ACCOUNT_EXISTS");
    }

    throw new Error(profileError.message);
  }

  return user;
}