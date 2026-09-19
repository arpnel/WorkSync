import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  paymentUser,
  getProjectPayment,
  paymentResponse,
} from "@/services/payments/paymentServer";
import { PaymentError } from "@/lib/payments/paymongo";
export const runtime = "nodejs";
const input = z
  .object({
    p_id: z.string().uuid(),
    p_project: z.string().uuid(),
    p_milestone: z.string().uuid().nullable(),
    p_body: z.string().trim().max(10000),
    p_link: z
      .string()
      .url()
      .regex(/^https?:\/\//)
      .nullable(),
    p_kind: z.enum(["progress", "delivery"]),
    p_path: z.string().nullable(),
    p_name: z.string().nullable(),
  })
  .strict()
  .refine((value) => Boolean(value.p_body || value.p_link || value.p_path), {
    message: "Add notes, a link, or an attachment.",
  });
export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      throw new PaymentError("Invalid work submission.", 400);
    const body = parsed.data;
    const payment = await getProjectPayment(db, body.p_project, user.id);
    if (payment.status !== "paid")
      throw new PaymentError(
        "The client must pay before work can be submitted.",
        409,
      );
    const { data: project, error } = await db
      .from("projects")
      .select("budget,freelancer_id,status")
      .eq("project_id", body.p_project)
      .single();
    if (error || !project) throw new PaymentError("Project unavailable.", 404);
    const owner = await db
      .from("freelancer_profiles")
      .select("user_id")
      .eq("freelancer_id", project.freelancer_id)
      .single();
    if (owner.error || owner.data?.user_id !== user.id)
      throw new PaymentError(
        "Only the assigned freelancer can submit work.",
        403,
      );
    if (
      !["active", "in_progress", "revision"].includes(project.status) ||
      Number(payment.amount) !== Number(project.budget)
    )
      throw new PaymentError(
        "The full agreed payment is required for this active project.",
        409,
      );
    if (
      body.p_path &&
      !body.p_path.startsWith(`${body.p_project}/${user.id}/${body.p_id}/`)
    )
      throw new PaymentError("Invalid attachment path.", 400);
    const token = request.headers.get("authorization")!;
    const scoped = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: token } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const result = await scoped.rpc("worksync_submit_work", body);
    if (result.error) throw new PaymentError(result.error.message, 400);
    return Response.json(
      { saved: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return paymentResponse(error);
  }
}
