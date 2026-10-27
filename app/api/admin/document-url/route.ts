import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";

export const runtime = "nodejs";

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

type DocumentSource =
  | "tax_document"
  | "tax_declaration"
  | "seller_submission"
  | "verification_request";

export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const admin = await db
      .from("admin_members")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (admin.error || !admin.data)
      throw new PaymentError("Administrator access required.", 403);

    const body = (await request.json().catch(() => null)) as {
      source?: unknown;
      recordId?: unknown;
      path?: unknown;
    } | null;
    const source = body?.source as DocumentSource;
    const recordId = typeof body?.recordId === "string" ? body.recordId : "";
    if (
      !["tax_document", "tax_declaration", "seller_submission", "verification_request"].includes(source) ||
      !/^[0-9a-f-]{36}$/i.test(recordId)
    ) {
      throw new PaymentError("A valid document record is required.", 400);
    }

    let paths: string[] = [];
    if (source === "tax_document") {
      const result = await db.from("tax_documents").select("document_path").eq("document_id", recordId).maybeSingle();
      if (result.error) throw new PaymentError("Tax document record is unavailable.");
      if (result.data?.document_path) paths = [result.data.document_path];
    } else if (source === "tax_declaration") {
      const result = await db.from("freelancer_tax_declarations").select("document_path").eq("declaration_id", recordId).maybeSingle();
      if (result.error) throw new PaymentError("Tax declaration record is unavailable.");
      if (result.data?.document_path) paths = [result.data.document_path];
    } else if (source === "seller_submission") {
      const result = await db.from("freelancer_seller_verification_submissions").select("document_path").eq("submission_id", recordId).maybeSingle();
      if (result.error) throw new PaymentError("Seller document record is unavailable.");
      if (result.data?.document_path) paths = [result.data.document_path];
    } else {
      const result = await db.from("verification_requests").select("document_paths").eq("request_id", recordId).maybeSingle();
      if (result.error) throw new PaymentError("Identity verification record is unavailable.");
      paths = Array.isArray(result.data?.document_paths) ? result.data.document_paths : [];
    }

    const path = typeof body?.path === "string" ? body.path : paths[0];
    if (!path || !paths.includes(path))
      throw new PaymentError("This document is not attached to the selected review record.", 404);

    const { data, error } = await db.storage
      .from("verification-documents")
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl)
      throw new PaymentError("Unable to open this document. It may have been removed from storage.", 503);
    return json({ url: data.signedUrl });
  } catch (error) {
    return paymentResponse(error);
  }
}
