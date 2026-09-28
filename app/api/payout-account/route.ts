import { destinationSchema, encryptDestination } from "@/lib/payments/payouts";
import { PaymentError, paymentMode } from "@/lib/payments/paymongo";
import {
  paymentUser,
  paymentResponse,
} from "@/services/payments/paymentServer";
export const runtime = "nodejs";
const json = (data: unknown) =>
  Response.json(data, { headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const role = await db
      .from("freelancer_profiles")
      .select("freelancer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (role.error) throw new PaymentError("Unable to check account role.");
    if (!role.data) return json({ eligible: false });
    const { data, error } = await db
      .from("freelancer_payout_accounts")
      .select("bank_label,account_last4,updated_at")
      .eq("user_id", user.id)
      .eq("mode", paymentMode())
      .maybeSingle();
    if (error) throw new PaymentError("Payout setup is not available yet.");
    return json({ eligible: true, mode: paymentMode(), account: data });
  } catch (error) {
    return paymentResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const role = await db
      .from("freelancer_profiles")
      .select("freelancer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (role.error || !role.data)
      throw new PaymentError("A freelancer account is required.", 403);
    const parsed = destinationSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      throw new PaymentError(
        "Enter the account holder, account number, bank BIC, and transfer network.",
        400,
      );
    const value = parsed.data;
    const { error } = await db
      .from("freelancer_payout_accounts")
      .upsert(
        {
          user_id: user.id,
          mode: paymentMode(),
          bank_label: value.bankLabel,
          account_last4: value.number.slice(-4),
          encrypted_destination: encryptDestination(value),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,mode" },
      );
    if (error) throw new PaymentError("Payout account could not be saved.");
    return json({ saved: true });
  } catch (error) {
    return paymentResponse(error);
  }
}
