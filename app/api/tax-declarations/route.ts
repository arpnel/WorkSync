import { PaymentError } from "@/lib/payments/paymongo";
import { inspectTaxDocument } from "@/lib/tax/taxDocumentUpload";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const { data, error } = await db.from("freelancer_tax_declarations")
      .select("declaration_id,tax_year,reported_threshold_status,status,submitted_at,reviewed_at,review_notes,document_path")
      .eq("user_id", user.id).order("tax_year", { ascending: false });
    if (error) throw new PaymentError("Tax declaration records are unavailable.");
    const declarations = await Promise.all((data ?? []).map(async row => {
      const { data: signed, error: signedError } = await db.storage.from("verification-documents").createSignedUrl(row.document_path, 60, { download: true });
      const visible = { ...row };
      delete visible.document_path;
      return { ...visible, document_url: signedError ? null : signed.signedUrl };
    }));
    return json({ declarations });
  } catch (error) { return paymentResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const profile = await db.from("freelancer_profiles").select("user_id").eq("user_id", user.id).maybeSingle();
    if (profile.error) throw new PaymentError("Unable to check freelancer account.");
    if (!profile.data) throw new PaymentError("Only freelancers can submit tax documents.", 403);
    const body = await request.json().catch(() => null) as { taxYear?: unknown; documentPath?: unknown; thresholdStatus?: unknown } | null;
    const year = Number(body?.taxYear);
    const path = body?.documentPath;
    const validPath = typeof path === "string" && path.startsWith(`${user.id}/tax/${year}/`) && /^[a-f\d-]{36}\.(pdf|png|jpe?g)$/i.test(path.slice(path.lastIndexOf("/") + 1));
    if (!Number.isInteger(year) || year < 2024 || year > new Date().getUTCFullYear() + 1 || !["not_exceeding", "exceeded"].includes(String(body?.thresholdStatus)) || !validPath)
      throw new PaymentError("Choose a valid tax year and upload a PDF, JPG, or PNG sworn declaration.", 400);
    const ticket = await db.from("tax_document_upload_tickets").select("document_path").eq("document_path", path).eq("user_id", user.id).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (ticket.error || !ticket.data) throw new PaymentError("This upload session expired. Start the document upload again.", 403);
    const { data: document, error: fileError } = await db.storage.from("verification-documents").download(path);
    if (fileError || !document) throw new PaymentError("Upload the selected file before submitting it for review.", 400);
    try { inspectTaxDocument(path.slice(path.lastIndexOf("/") + 1), document.type, new Uint8Array(await document.arrayBuffer())); }
    catch (cause) {
      await Promise.all([db.storage.from("verification-documents").remove([path]), db.from("tax_document_upload_tickets").delete().eq("document_path", path).eq("user_id", user.id)]);
      throw new PaymentError(cause instanceof Error ? cause.message : "Invalid document file.", 400);
    }
    const { data, error } = await db.from("freelancer_tax_declarations").insert({ user_id: user.id, tax_year: year, reported_threshold_status: body?.thresholdStatus, document_path: path, status: "pending" }).select("declaration_id,tax_year,reported_threshold_status,status,submitted_at").single();
    if (error) {
      await Promise.all([db.storage.from("verification-documents").remove([path]), db.from("tax_document_upload_tickets").delete().eq("document_path", path).eq("user_id", user.id)]);
      throw new PaymentError(error.code === "23505" ? "A declaration is already pending or accepted for that tax year." : "Tax declaration could not be submitted.", 409);
    }
    await db.from("tax_document_upload_tickets").delete().eq("document_path", path).eq("user_id", user.id);
    return json({ declaration: data }, 201);
  } catch (error) { return paymentResponse(error); }
}
