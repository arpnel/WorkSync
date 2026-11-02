import { z } from "zod";
import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await context.params;
    if (!z.string().uuid().safeParse(reportId).success)
      return json({ error: "Invalid report." }, 400);

    const { db, user } = await paymentUser(request);
    const admin = await db
      .from("admin_members")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (admin.error)
      throw new PaymentError("Unable to verify administrator access.");
    if (!admin.data)
      throw new PaymentError("Administrator access required.", 403);

    const { data: report, error: reportError } = await db
      .from("listing_reports")
      .select("reporter_id")
      .eq("report_id", reportId)
      .maybeSingle();
    if (reportError)
      throw new PaymentError("Reporter account details are unavailable.");
    if (!report) throw new PaymentError("Report not found.", 404);

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("display_name,first_name,last_name")
      .eq("user_id", report.reporter_id)
      .maybeSingle();
    if (profileError)
      throw new PaymentError("Reporter account details are unavailable.");

    const reporterName =
      profile?.display_name?.trim() ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
      "Name unavailable";

    return json({ reporterId: report.reporter_id, reporterName });
  } catch (error) {
    return paymentResponse(error);
  }
}
