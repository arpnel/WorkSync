import { supabase } from "@/lib/supabaseClient";

import { DEFAULT_ROLE } from "../../components/auth/constants";
import { CreateAccountData } from "../../types/auth/signup.types";

export async function createAccount({
  email,
  password,
  firstName,
  lastName,
}: CreateAccountData) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanFirstName = firstName.trim();
  const cleanLastName = lastName.trim();

  if (!cleanEmail || !password || !cleanFirstName || !cleanLastName) {
    throw new Error("INVALID_SIGNUP_DATA");
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          first_name: cleanFirstName,
          last_name: cleanLastName,
          role: DEFAULT_ROLE,
        },
      },
    });

    if (error) {
      const message = error.message.toLowerCase();

      if (
        message.includes("already") ||
        message.includes("registered") ||
        message.includes("exists")
      ) {
        throw new Error("ACCOUNT_EXISTS");
      }

      throw error;
    }

    if (!data.user) {
      throw new Error("FAILED_TO_CREATE_ACCOUNT");
    }

    return data.user;
  } catch (error) {
    console.error("SIGNUP AUTH ERROR:", error);
    throw error;
  }
}
