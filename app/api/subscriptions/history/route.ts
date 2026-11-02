import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";
import { getSubscriptionPaymentHistory } from "@/services/subscriptions/subscriptionServer";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const payments = await getSubscriptionPaymentHistory(db, user.id);
    return Response.json(
      { payments },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return paymentResponse(error);
  }
}
