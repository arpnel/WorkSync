import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const documentTypes = ["bir_cor", "vat_registration", "tax_exemption", "business_tax_support"] as const;

async function partyTypes(db: Awaited<ReturnType<typeof paymentUser>>["db"], userId: string) {
  const [freelancer, client] = await Promise.all([
    db.from("freelancer_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
    db.from("client_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (freelancer.error || client.error) throw new PaymentError("Unable to check account roles.");
  return [freelancer.data ? "freelancer" : null, client.data ? "client" : null].filter(Boolean) as ("freelancer" | "client")[];
}

export async function GET(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const types = await partyTypes(db, user.id);
    if (!types.length) throw new PaymentError("Tax documents are available to client and freelancer accounts.", 403);
    const { data, error } = await db.from("tax_documents").select("document_id,party_type,document_type,registered_name,claimed_tax_treatment,legal_basis,tax_year,issued_at,expires_at,status,submitted_at,reviewed_at,review_reason").eq("user_id", user.id).order("submitted_at", { ascending: false });
    if (error) throw new PaymentError("Tax documents are unavailable. The tax document migration may not be applied yet.");
    const today = new Date().toISOString().slice(0, 10);
    return json({ partyTypes: types, documents: (data ?? []).map(row => ({ ...row, status: row.status !== "rejected" && row.expires_at && row.expires_at < today ? "expired" : row.status })) });
  } catch (error) { return paymentResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const partyType = body?.partyType;
    const type = body?.documentType;
    const path = body?.documentPath;
    const registeredName = typeof body?.registeredName === "string" ? body.registeredName.trim().slice(0, 200) : "";
    const claimedTreatment = typeof body?.claimedTaxTreatment === "string" ? body.claimedTaxTreatment.trim().slice(0, 300) : "";
    const legalBasis = typeof body?.legalBasis === "string" ? body.legalBasis.trim().slice(0, 1000) : "";
    const taxYear = body?.taxYear == null || body.taxYear === "" ? null : Number(body.taxYear);
    const issuedAt = typeof body?.issuedAt === "string" && body.issuedAt ? body.issuedAt : null;
    const expiresAt = typeof body?.expiresAt === "string" && body.expiresAt ? body.expiresAt : null;
    if (!(partyType === "client" || partyType === "freelancer") || !documentTypes.includes(type as typeof documentTypes[number]) || typeof path !== "string" || !path.startsWith(`${user.id}/tax-docs/${partyType}/`) || !/^[a-f\d-]{36}\.(pdf|png|jpe?g)$/i.test(path.slice(path.lastIndexOf("/") + 1)))
      throw new PaymentError("Choose a valid tax document and upload a PDF, JPG, or PNG.", 400);
    if (taxYear !== null && (!Number.isInteger(taxYear) || taxYear < 2024 || taxYear > new Date().getUTCFullYear() + 1)) throw new PaymentError("Choose a valid tax year.", 400);
    if ([issuedAt, expiresAt].some(value => value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value))) throw new PaymentError("Enter valid issue and expiry dates.", 400);
    if (expiresAt && issuedAt && expiresAt < issuedAt) throw new PaymentError("Expiry date cannot be before the issue date.", 400);
    if (type === "bir_cor" && !registeredName) throw new PaymentError("Enter the registered business name shown on the COR.", 400);
    const roles = await partyTypes(db, user.id);
    if (!roles.includes(partyType as "client" | "freelancer")) throw new PaymentError("That account role is not available.", 403);
    const { data: file, error: fileError } = await db.storage.from("verification-documents").download(path);
    if (fileError || !file) throw new PaymentError("Uploaded document could not be verified in private storage.", 400);
    if (file.size > 10 * 1024 * 1024) throw new PaymentError("Tax documents must be 10 MB or smaller.", 400);
    const { data, error } = await db.from("tax_documents").insert({ user_id: user.id, party_type: partyType, document_type: type, document_path: path, registered_name: registeredName, claimed_tax_treatment: claimedTreatment, legal_basis: legalBasis, tax_year: taxYear, issued_at: issuedAt, expires_at: expiresAt }).select("document_id,party_type,document_type,status,submitted_at").single();
    if (error) throw new PaymentError(error.code === "23505" ? "This document has already been submitted." : "Tax document could not be submitted.", 409);
    return json({ document: data }, 201);
  } catch (error) { return paymentResponse(error); }
}


