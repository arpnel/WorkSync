import { CreateAccountData } from "../../types/auth/signup.types";

export async function createAccount({ email, password, firstName, lastName }: CreateAccountData) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanFirstName = firstName.trim();
  const cleanLastName = lastName.trim();
  if (!cleanEmail || !password || !cleanFirstName || !cleanLastName) throw new Error("INVALID_SIGNUP_DATA");
  try {
    const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "signup", email: cleanEmail, password, firstName: cleanFirstName, lastName: cleanLastName }) });
    const result = await response.json().catch(() => null) as { user?: { id: string }; error?: string } | null;
    if (!response.ok) {
      const message = result?.error ?? "Failed to create account.";
      if (/already|registered|exists/i.test(message)) throw new Error("ACCOUNT_EXISTS");
      throw new Error(message);
    }
    if (!result?.user) throw new Error("FAILED_TO_CREATE_ACCOUNT");
    return result.user;
  } catch (error) {
    console.error("SIGNUP AUTH ERROR:", error);
    throw error;
  }
}
