import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PaymentError, paymentId, paymentMode } from "@/lib/payments/paymongo";
import {
  paymentDatabase,
  paymentResponse,
  paymentUser,
} from "@/services/payments/paymentServer";
import { reviewProjectPayment } from "@/services/payments/settlementServer";

export const runtime = "nodejs";

const input = z
  .object({
    id: z.string().uuid(),
    action: z.enum([
      "under_review",
      "resume_work",
      "cancel_project",
      "complete_project",
      "complete_milestone",
    ]),
    notes: z.string().trim().min(1).max(10000),
  })
  .strict();

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

async function payoutRecordsExist(
  projectId: string,
  disputeMilestoneId: string | null,
  action: "complete_project" | "complete_milestone",
) {
  const db = paymentDatabase();
  let expectedMilestones: Array<string | null>;
  if (action === "complete_milestone") {
    if (!disputeMilestoneId) return false;
    expectedMilestones = [disputeMilestoneId];
  } else {
    const milestones = await db
      .from("milestones")
      .select("milestone_id")
      .eq("project_id", projectId);
    if (milestones.error) return false;
    expectedMilestones = milestones.data?.length
      ? milestones.data.map((row) => row.milestone_id)
      : [null];
  }

  const mode = paymentMode();
  const payment = paymentId(projectId, mode);
  const payouts = await db
    .from("project_payouts")
    .select("milestone_id,status")
    .eq("project_id", projectId)
    .eq("payment_id", payment)
    .eq("mode", mode)
    .neq("status", "cancelled");
  if (payouts.error) return false;
  const recorded = new Set(
    (payouts.data ?? []).map((row) => row.milestone_id ?? "standard"),
  );
  return expectedMilestones.every((milestoneId) =>
    recorded.has(milestoneId ?? "standard"),
  );
}

export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const admin = await db
      .from("admin_members")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (admin.error || !admin.data)
      throw new PaymentError("Administrator access required.", 403);

    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      throw new PaymentError("Choose an action and provide review notes.", 400);
    const { id, action, notes } = parsed.data;
    const disputeResult = await db
      .from("project_disputes")
      .select("project_id,milestone_id,status,resolution_action")
      .eq("dispute_id", id)
      .maybeSingle();
    if (disputeResult.error || !disputeResult.data)
      throw new PaymentError("Dispute not found.", 404);
    const dispute = disputeResult.data;
    if (dispute.status === "resolved")
      throw new PaymentError("This dispute has already been resolved.", 409);

    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token)
      throw new PaymentError("Sign in to review this dispute.", 401);
    const scoped = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const resolve = async () => {
      const result = await scoped.rpc("worksync_resolve_dispute", {
        p_id: id,
        p_action: action,
        p_notes: notes,
      });
      if (result.error)
        throw new PaymentError(
          result.error.message || "Dispute action could not be saved.",
          409,
        );
    };

    if (action !== "complete_project" && action !== "complete_milestone") {
      await resolve();
      return json({ saved: true });
    }

    let resolutionSaved = false;
    let settlementReviewStatus:
      | "disabled"
      | "version_unavailable"
      | "payment_unavailable"
      | "reviewed_pending"
      | "completed"
      | "settlement_pending";
    try {
      settlementReviewStatus = await reviewProjectPayment(
        dispute.project_id,
        async () => {
          await resolve();
          resolutionSaved = true;
        },
      );
    } catch (error) {
      if (!resolutionSaved) throw error;
      console.error("[admin/disputes] Settlement review deferred", {
        disputeId: id,
        projectId: dispute.project_id,
      });
      settlementReviewStatus = "settlement_pending";
    }

    if (!resolutionSaved) {
      if (settlementReviewStatus === "payment_unavailable")
        throw new PaymentError(
          "A confirmed project payment is required before completing delivery.",
          409,
        );
      throw new PaymentError(
        "The normal settlement checks are unavailable; no completion was saved.",
        503,
      );
    }

    if (
      !(await payoutRecordsExist(
        dispute.project_id,
        dispute.milestone_id,
        action,
      ))
    ) {
      settlementReviewStatus = "settlement_pending";
    }
    return json({ saved: true, settlementReviewStatus });
  } catch (error) {
    return paymentResponse(error);
  }
}
