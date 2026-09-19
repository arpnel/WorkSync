import { supabase } from "@/lib/supabaseClient";
import {
  databaseError,
  platformAction,
  requireUser,
} from "@/services/platform/platformService";
export type ListingKind = "service" | "job";
export const listingKey = (kind: ListingKind, id: string) => `${kind}:${id}`;
export async function getSavedListings(): Promise<Set<string>> {
  const user = await requireUser();
  const results = await Promise.all([
    supabase.from("saved_services").select("service_id").eq("user_id", user.id),
    supabase.from("saved_jobs").select("job_id").eq("user_id", user.id),
  ]);
  for (const result of results)
    if (result.error) throw databaseError(result.error);
  return new Set([
    ...(results[0].data ?? []).map((row) =>
      listingKey("service", row.service_id),
    ),
    ...(results[1].data ?? []).map((row) => listingKey("job", row.job_id)),
  ]);
}
export async function saveListing(
  kind: ListingKind,
  id: string,
  saved: boolean,
) {
  const user = await requireUser();
  const table = kind === "service" ? "saved_services" : "saved_jobs";
  const column = kind === "service" ? "service_id" : "job_id";
  const result = saved
    ? await supabase
        .from(table)
        .upsert(
          { user_id: user.id, [column]: id },
          { onConflict: `user_id,${column}`, ignoreDuplicates: true },
        )
    : await supabase.from(table).delete().eq("user_id", user.id).eq(column, id);
  if (result.error) throw databaseError(result.error);
}
export const reportReasons = [
  "Scam",
  "Spam",
  "Misleading listing",
  "Inappropriate content",
  "Suspicious behavior",
  "Payment concern",
  "Intellectual property concern",
  "Prohibited content",
  "Other",
] as const;
export async function reportListing(
  kind: ListingKind,
  id: string,
  reason: string,
  description: string,
) {
  if (!reportReasons.some((item) => item === reason))
    throw new Error("Choose a report reason.");
  return platformAction("worksync_report_listing", {
    p_kind: kind,
    p_listing: id,
    p_reason: reason,
    p_description: description.trim(),
  });
}
export async function applyForJob(
  jobId: string,
  proposal: string,
  price: number,
  days: number,
) {
  if (!proposal.trim() || proposal.length > 10000)
    throw new Error("Enter a proposal of up to 10,000 characters.");
  if (
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isInteger(days) ||
    days < 1
  )
    throw new Error(
      "Enter a positive price and whole number of delivery days.",
    );
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to apply.");
  const response = await fetch("/api/applications", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jobId, proposal: proposal.trim(), price, days }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.applicationId)
    throw new Error(
      result?.error ||
        "Application submission could not be confirmed. Check your Requests before retrying.",
    );
  return result.applicationId as string;
}
export async function getFreelancerRatings(
  ids: string[],
): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from("reviews")
    .select("freelancer_id, rating")
    .in("freelancer_id", [...new Set(ids)])
    .eq("reviewer_role", "client");
  if (error) throw databaseError(error);
  const totals = new Map<string, { sum: number; count: number }>();
  for (const row of data ?? []) {
    const current = totals.get(row.freelancer_id) ?? { sum: 0, count: 0 };
    totals.set(row.freelancer_id, {
      sum: current.sum + Number(row.rating),
      count: current.count + 1,
    });
  }
  return new Map(
    [...totals].map(([id, value]) => [id, value.sum / value.count]),
  );
}
