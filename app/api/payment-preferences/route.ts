import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  paymentUser,
  paymentResponse,
} from "@/services/payments/paymentServer";
import { PaymentError } from "@/lib/payments/paymongo";
export const runtime = "nodejs";
export async function PATCH(request: Request) {
  try {
    await paymentUser(request);
    const input = z
      .object({ projectId: z.string().uuid(), autoAccept: z.boolean() })
      .strict()
      .safeParse(await request.json().catch(() => null));
    if (!input.success)
      throw new PaymentError("Invalid payment preference.", 400);
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: request.headers.get("authorization")! },
        },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const result = await db.rpc("worksync_set_auto_accept", {
      p_project: input.data.projectId,
      p_enabled: input.data.autoAccept,
    });
    if (result.error)
      throw new PaymentError(
        result.error.message,
        result.error.code === "42501" ? 403 : 409,
      );
    return Response.json(result.data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return paymentResponse(error);
  }
}
