import "server-only";
import { createClient } from "@supabase/supabase-js";
import { assessListing } from "@/lib/ai/listingModeration";
import { LISTING_MODERATION_POLICY, validateListingRules } from "@/lib/ai/listingModerationPolicy";

type ListingType = "job" | "service";
const db = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("MODERATION_CONFIGURATION");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

export async function moderateCreatedListing(type: ListingType, id: string, ownerId: string) {
  const client = db();
  const claim = await client.from("listing_submissions").update({ assessment_started_at: new Date().toISOString() }).eq("listing_type", type).eq("listing_id", id).eq("owner_id", ownerId).is("assessment_started_at", null).select("submission_id,title,description").maybeSingle();
  if (claim.error) throw new Error(`MODERATION_CLAIM_FAILED:${claim.error.code}`);
  if (!claim.data) return;
  const ruleIssues = validateListingRules(claim.data.title, claim.data.description);
  if (ruleIssues.length) {
    await client.from("listing_submissions").update({ status: "manual_review", rule_results: ruleIssues, failure_reason: ruleIssues.join(" ") }).eq("submission_id", claim.data.submission_id);
    return;
  }
  try {
    const assessment = await assessListing({ type, title: claim.data.title, description: claim.data.description });
    const categoriesAllowedForAutomaticRejection = new Set(["hate_or_abuse", "threat", "scam_or_fraud"]);
    const automaticReject = process.env.LISTING_AUTO_REJECT_ENABLED === "true" && assessment.risk === "critical" && assessment.confidence >= LISTING_MODERATION_POLICY.automaticRejectionConfidence && assessment.evidence.length > 0 && assessment.explanation.length >= 40 && assessment.categories.some((category) => categoriesAllowedForAutomaticRejection.has(category));
    const status = automaticReject ? "rejected" : assessment.risk === "high" || assessment.risk === "critical" ? "manual_review" : "pending_review";
    const saved = await client.from("listing_submissions").update({ ai_risk: assessment.risk, ai_explanation: assessment.explanation, ai_categories: assessment.categories, ai_evidence: assessment.evidence, ai_confidence: assessment.confidence, ai_recommendation: assessment.recommendation, status, rule_results: [], decision: automaticReject ? "automatic_rejection" : null, assessed_at: new Date().toISOString(), failure_reason: null }).eq("submission_id", claim.data.submission_id);
    if (saved.error) throw saved.error;
    if (automaticReject) {
      await client.from("notifications").insert({ user_id: ownerId, type: "listing_moderation", title: "Listing rejected after automated review", message: `“${claim.data.title}” was not published. Automated review identified ${assessment.categories.join(", ") || "a serious policy concern"}: ${assessment.explanation} Please edit the listing and resubmit, or contact an administrator to request a review.`, related_id: id, is_read: false });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 300) : "Unknown moderation error";
    await client.from("listing_submissions").update({ status: "manual_review", failure_reason: reason }).eq("submission_id", claim.data.submission_id);
    console.error("Listing moderation failed; submission remains hidden for manual review", { submissionId: claim.data.submission_id, reason });
  }
}






