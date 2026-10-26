import { destinationSchema, decryptDestination, encryptDestination } from "@/lib/payments/payouts";
import { PaymentError, paymentMode } from "@/lib/payments/paymongo";
import {
  paymentUser,
  paymentResponse,
} from "@/services/payments/paymentServer";
export const runtime = "nodejs";
const json = (data: unknown) =>
  Response.json(data, { headers: { "Cache-Control": "no-store" } });
async function reconcileWaitingPayouts(
  db: Awaited<ReturnType<typeof paymentUser>>["db"],
  userId: string,
  mode: string,
) {
  const waiting = await db
    .from("project_payouts")
    .select("project_id,payment_id")
    .eq("recipient_id", userId)
    .eq("mode", mode)
    .eq("status", "awaiting_account");
  if (waiting.error) {
    console.error("Payout account reconciliation query failed", {
      code: waiting.error.code,
    });
    return false;
  }

  const pairs = new Map<string, { projectId: string; paymentId: string }>();
  for (const payout of waiting.data ?? [])
    pairs.set(JSON.stringify([payout.project_id, payout.payment_id]), {
      projectId: payout.project_id,
      paymentId: payout.payment_id,
    });
  for (const { projectId, paymentId } of pairs.values()) {
    const { error } = await db.rpc("worksync_settle_project", {
      p_project: projectId,
      p_payment: paymentId,
      p_mode: mode,
    });
    if (error) {
      console.error("Payout account reconciliation RPC failed", {
        code: error.code,
      });
      return false;
    }
  }
  const remaining = await db
    .from("project_payouts")
    .select("payout_id")
    .eq("recipient_id", userId)
    .eq("mode", mode)
    .eq("status", "awaiting_account");
  if (remaining.error || (remaining.data ?? []).length > 0) {
    console.error("Payout account reconciliation did not clear all waiting payouts", {
      code: remaining.error?.code ?? "still_awaiting_account",
    });
    return false;
  }  return true;
}
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
      .select("bank_label,account_last4,updated_at,encrypted_destination")
      .eq("user_id", user.id)
      .eq("mode", paymentMode())
      .maybeSingle();
    if (error) throw new PaymentError("Payout setup is not available yet.");
    let provider: "instapay" | "pesonet" | null = null;
    if (data?.encrypted_destination) {
      try {
        provider = decryptDestination(data.encrypted_destination).provider;
      } catch {
        // Keep the masked account visible if an older encrypted record cannot be decoded.
      }
    }
    const mode = paymentMode();
    const reconciled = data
      ? await reconcileWaitingPayouts(db, user.id, mode)
      : true;
    return json({
      eligible: true,
      mode,
      account: data ? { bank_label: data.bank_label, account_last4: data.account_last4, provider } : null,
      reconciliation: reconciled ? "complete" : "pending",
    });
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

    const reconciled = await reconcileWaitingPayouts(
      db,
      user.id,
      paymentMode(),
    );
    return json({
      saved: true,
      reconciliation: reconciled ? "complete" : "pending",
    });
  } catch (error) {
    return paymentResponse(error);
  }
}
