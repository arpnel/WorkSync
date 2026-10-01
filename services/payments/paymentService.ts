import { supabase } from "@/lib/supabaseClient";
export interface ProjectPayment {
  status: "unpaid" | "pending" | "processing" | "paid";
  mode: "test" | "live";
  amount?: number;
  paidAt?: string | null;
  autoReleaseEnabled?: boolean;
  settlementVersion?: number;
  autoAccept?: boolean;
  finalMilestoneId?: string | null;
  payouts?: {
    payout_id: string;
    milestone_id: string | null;
    title: string;
    status: string;
    amount: number;
    paid_at: string | null;
  }[];
  refunds?: {
    refund_id: string;
    status: string;
    amount: number;
    refunded_at: string | null;
  }[];
  payout?: { status: string; paid_at?: string | null; amount?: number } | null;
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
export async function setAutoAccept(projectId: string, autoAccept: boolean) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to change automatic acceptance.");
  const response = await fetch("/api/payment-preferences", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ projectId, autoAccept }),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Unable to save automatic acceptance.");
  return body;
}
