import { z } from "zod";
import { PaymentError, paymentMode } from "@/lib/payments/paymongo";
import {
  paymentUser,
  getProjectPayment,
  createProjectCheckout,
  paymentResponse,
} from "@/services/payments/paymentServer";
export const runtime = "nodejs";
const input = z.object({ projectId: z.string().uuid() }).strict();
const json = (value: unknown) =>
  Response.json(value, { headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const parsed = input.safeParse({
      projectId: new URL(request.url).searchParams.get("projectId"),
    });
    if (!parsed.success) throw new PaymentError("Invalid project.", 400);
    return json(await getProjectPayment(db, parsed.data.projectId, user.id));
  } catch (error) {
    return paymentResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new PaymentError("Invalid project.", 400);
    const configured = process.env.APP_URL;
    const url = new URL(configured || request.url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (!configured && !local) ||
      (paymentMode() === "live" && (url.protocol !== "https:" || local))
    )
      throw new PaymentError(
        "Set APP_URL to your public HTTPS application URL before enabling payments.",
      );
    if (paymentMode() === "live" && !process.env.PAYMONGO_WEBHOOK_SECRET)
      throw new PaymentError(
        "Configure the PayMongo webhook before accepting live payments.",
      );
    return json(
      await createProjectCheckout(
        db,
        parsed.data.projectId,
        user.id,
        url.origin,
      ),
    );
  } catch (error) {
    return paymentResponse(error);
  }
}
