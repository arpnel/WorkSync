import { PaymentError } from "@/lib/payments/paymongo";
import { encryptTin, normalizeTin } from "@/lib/tax/taxIdentifier";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const profile = await db.from("freelancer_profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile.error) throw new PaymentError("TIN status is unavailable.");
    if (!profile.data) throw new PaymentError("Only freelancers can view TIN status.", 403);

    const { data, error } = await db.from("freelancer_tax_identifiers")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new PaymentError("TIN status is unavailable.");
    return json({ hasTin: Boolean(data) });
  } catch (error) {
    return paymentResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const profile = await db.from("freelancer_profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile.error) throw new PaymentError("Unable to check freelancer account.");
    if (!profile.data) throw new PaymentError("Only freelancers can save a TIN.", 403);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const encryptedTin = encryptTin(normalizeTin(body?.tin));
    const { error } = await db.from("freelancer_tax_identifiers").upsert({
      user_id: user.id,
      encrypted_tin: encryptedTin,
      created_by: user.id,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw new PaymentError("TIN could not be saved securely.");
    return json({ hasTin: true });
  } catch (error) {
    return paymentResponse(error);
  }
}
