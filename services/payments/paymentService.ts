import { supabase } from "@/lib/supabaseClient";
export interface ProjectPayment {
  status: "unpaid" | "pending" | "processing" | "paid";
  mode: "test" | "live";
  amount?: number;
  paidAt?: string | null;
}
async function requestPayment(projectId: string, checkout: boolean) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to view payments.");
  const response = await fetch(
    checkout
      ? "/api/payments"
      : `/api/payments?projectId=${encodeURIComponent(projectId)}`,
    {
      method: checkout ? "POST" : "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: checkout ? JSON.stringify({ projectId }) : undefined,
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Payment request failed.");
  return data;
}
export async function getProjectPayment(
  projectId: string,
): Promise<ProjectPayment> {
  return requestPayment(projectId, false);
}
export async function startProjectPayment(projectId: string): Promise<string> {
  return (await requestPayment(projectId, true)).checkoutUrl;
}
