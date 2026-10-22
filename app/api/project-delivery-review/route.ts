import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { paymentUser, paymentResponse } from "@/services/payments/paymentServer";
import { PaymentError } from "@/lib/payments/paymongo";
import { notifyProjectWorkReviewed } from "@/services/email/projectEmails";

export const runtime = "nodejs";
const schema = z.object({ projectId: z.string().uuid(), submissionId: z.string().uuid(), action: z.enum(["approve", "revision"]), instructions: z.string().max(5000) }).strict().refine((value) => value.action !== "revision" || Boolean(value.instructions.trim()), { message: "Revision instructions are required." });
export async function POST(request: Request) {
  try {
    const { user } = await paymentUser(request);
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new PaymentError("Invalid project review.", 400);
    const token = request.headers.get("authorization")!;
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: token } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await db.rpc("worksync_review_submission", {
      p_submission: input.data.submissionId,
      p_action: input.data.action,
      p_instructions: input.data.instructions.trim(),
    });
    if (error) throw new PaymentError(error.message, 400);
    after(async () => {
      try {
        await notifyProjectWorkReviewed(input.data.projectId, input.data.submissionId, input.data.action, request.url);
      } catch {
        console.error("Could not prepare project review email");
      }
    });
    return Response.json({ saved: true, reviewedBy: user.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return paymentResponse(error);
  }
}