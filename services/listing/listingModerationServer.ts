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
  try {
    const ruleIssues = validateListingRules(claim.data.title, claim.data.description);
    if (ruleIssues.length) {
      const saved = await client.from("listing_submissions").update({
        status: "manual_review",
        failure_reason: ruleIssues.join(" "),
      }).eq("submission_id", claim.data.submission_id);
      if (saved.error) throw saved.error;
      await notifyOwner(
        client,
        ownerId,
        id,
        claim.data.submission_id,
        "Listing held for review",
        `“${claim.data.title}” needs administrator review before it can appear: ${ruleIssues.join(" ")} A reviewer will confirm whether changes are needed.`,
      );
      return;
    }

    const assessment = await assessListing({ type, title: claim.data.title, description: claim.data.description });
    const categoriesAllowedForAutomaticRejection = new Set(["hate_or_abuse", "threat", "scam_or_fraud"]);
    const automaticReject = process.env.LISTING_AUTO_REJECT_ENABLED === "true" && assessment.risk === "critical" && assessment.confidence >= LISTING_MODERATION_POLICY.automaticRejectionConfidence && assessment.evidence.length > 0 && assessment.explanation.length >= 40 && assessment.categories.some((category) => categoriesAllowedForAutomaticRejection.has(category));
    const status = automaticReject ? "rejected" : assessment.risk === "high" || assessment.risk === "critical" ? "manual_review" : "pending_review";
    const saved = await client.from("listing_submissions").update({ ai_risk: assessment.risk, ai_explanation: assessment.explanation, ai_categories: assessment.categories, ai_evidence: assessment.evidence, ai_confidence: assessment.confidence, ai_recommendation: assessment.recommendation, status, decision: automaticReject ? "automatic_rejection" : null, assessed_at: new Date().toISOString(), failure_reason: null }).eq("submission_id", claim.data.submission_id);
    if (saved.error) throw saved.error;
    if (automaticReject) {
      await notifyOwner(
        client,
        ownerId,
        id,
        claim.data.submission_id,
        "Listing rejected after automated review",
        `“${claim.data.title}” was not published. Automated review identified ${assessment.categories.join(", ") || "a serious policy concern"}: ${assessment.explanation} You can request an administrator review if you believe this was a mistake.`,
      );
    } else if (status === "manual_review") {
      await notifyOwner(
        client,
        ownerId,
        id,
        claim.data.submission_id,
        "Listing held for administrator review",
        `“${claim.data.title}” is hidden while an administrator reviews it. The automated review flagged ${assessment.categories.join(", ") || "a potential policy concern"}: ${assessment.explanation}`,
      );
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 300) : "Unknown moderation error";
    await client.from("listing_submissions").update({ status: "manual_review", failure_reason: reason }).eq("submission_id", claim.data.submission_id);
    console.error("Listing moderation failed; submission remains hidden for manual review", { submissionId: claim.data.submission_id, reason });
  }
}

async function notifyOwner(
  client: ReturnType<typeof db>,
  ownerId: string,
  listingId: string,
  submissionId: string,
  title: string,
  message: string,
) {
  const { error } = await client.from("notifications").insert({
    user_id: ownerId,
    type: "listing_moderation",
    title,
    message,
    related_id: listingId,
    is_read: false,
  });
  if (error)
    console.error("Listing moderation notice could not be saved", {
      submissionId,
      code: error.code,
    });
}






