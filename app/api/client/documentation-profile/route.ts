import { z } from "zod";
import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const updateSchema = z.object({
  clientType: z.enum(["individual", "organization"]),
  organizationName: z.string().trim().max(200).default(""),
  organizationAddress: z.string().trim().max(500).default(""),
}).strict();

export async function GET(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const { data: client, error: clientError } = await db.from("client_profiles")
      .select("client_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (clientError) throw new PaymentError("Client account details are unavailable.", 503);
    if (!client) throw new PaymentError("This account does not have a client profile.", 403);
    const { data, error } = await db.from("client_organization_profiles")
      .select("client_type,organization_name,organization_address")
      .eq("client_id", client.client_id)
      .maybeSingle();
    if (error) throw new PaymentError("Client documentation settings are unavailable. The prepared database migration must be applied.", 503);
    return json({
      clientType: data?.client_type ?? "individual",
      organizationName: data?.organization_name ?? "",
      organizationAddress: data?.organization_address ?? "",
    });
  } catch (error) {
    return paymentResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const body = updateSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) throw new PaymentError("Enter valid client account details.", 400);
    const value = body.data;
    if (value.clientType === "organization" && (!value.organizationName || !value.organizationAddress))
      throw new PaymentError("Enter your organization's registered name and address.", 400);
    const { data: client, error: clientError } = await db.from("client_profiles")
      .select("client_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (clientError) throw new PaymentError("Client account details are unavailable.", 503);
    if (!client) throw new PaymentError("This account does not have a client profile.", 403);
    const { data, error } = await db.from("client_organization_profiles")
      .upsert({
        client_id: client.client_id,
        client_type: value.clientType,
        organization_name: value.clientType === "organization" ? value.organizationName : null,
        organization_address: value.clientType === "organization" ? value.organizationAddress : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "client_id" })
      .select("client_type,organization_name,organization_address")
      .single();
    if (error) throw new PaymentError("Client account type could not be saved.", 503);
    if (!data) throw new PaymentError("This account does not have a client profile.", 403);
    return json({
      clientType: data.client_type,
      organizationName: data.organization_name ?? "",
      organizationAddress: data.organization_address ?? "",
    });
  } catch (error) {
    return paymentResponse(error);
  }
}
