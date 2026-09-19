import { supabase } from "@/lib/supabaseClient";
export interface VerificationStatus {
  status: string;
  verified: boolean;
  canStart: boolean;
}
export async function verificationRequest(method: "GET" | "POST") {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to verify your identity.");
  const response = await fetch("/api/verify", {
    method,
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Verification could not be loaded.");
  return body;
}
export async function getIdentityVerification(): Promise<VerificationStatus> {
  return verificationRequest("GET");
}
