"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StyledSelect } from "@/components/ui/styled-select";

type Party = "freelancer" | "client";
type DocType = "bir_cor" | "vat_registration" | "tax_exemption" | "business_tax_support";
type DocumentRow = { document_id: string; party_type: Party; document_type: DocType; registered_name: string; claimed_tax_treatment: string; legal_basis: string; tax_year: number | null; issued_at: string | null; expires_at: string | null; status: string; submitted_at: string; reviewed_at: string | null; review_reason: string };
function renewalNotice(expiresAt: string | null, status: string) { if (status === "expired") return "Expired; submit a renewed version."; if (!expiresAt) return "No expiry date recorded; check whether revalidation is required."; const days = Math.ceil((new Date(`${expiresAt}T00:00:00`).getTime() - new Date().setHours(0,0,0,0)) / 86400000); return days < 0 ? "Expired; submit a renewed version." : days <= 60 ? `Renewal due within ${days} day${days === 1 ? "" : "s"}.` : ""; }
const labels: Record<DocType, string> = { bir_cor: "BIR Certificate of Registration", vat_registration: "VAT registration evidence", tax_exemption: "Tax exemption or reduced-rate evidence", business_tax_support: "Other business tax support" };
export default function TaxDocuments() {
  const [parties, setParties] = useState<Party[]>([]);
  const [party, setParty] = useState<Party>("freelancer");
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [type, setType] = useState<DocType>("bir_cor");
  const [file, setFile] = useState<File | null>(null);
  const [registeredName, setRegisteredName] = useState("");
  const [treatment, setTreatment] = useState("");
  const [basis, setBasis] = useState("");
  const [issued, setIssued] = useState("");
  const [expires, setExpires] = useState("");
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useCallback(async (method: "GET" | "POST", body?: unknown) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in to manage tax documents.");
    const response = await fetch("/api/tax-documents", { method, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Tax documents unavailable.");
    return result;
  }, []);
  const load = useCallback(async () => { const result = await request("GET"); setParties(result.partyTypes ?? []); setRows(result.documents ?? []); }, [request]);
  useEffect(() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : "Tax documents unavailable.")); }, [load]);
  async function submit() {
    if (!file || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in to submit tax documents.");
      if (file.size > 10 * 1024 * 1024) throw new Error("Choose a file up to 10 MB.");
      const ext = file.name.split(".").at(-1)?.toLowerCase();
      if (!ext || !["pdf", "png", "jpg", "jpeg"].includes(ext)) throw new Error("Upload a PDF, PNG, or JPG.");
      const path = `${session.user.id}/tax-docs/${party}/${crypto.randomUUID()}.${ext}`;
      const upload = await supabase.storage.from("verification-documents").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upload.error) throw new Error("Document upload failed.");
      await request("POST", { partyType: party, documentType: type, documentPath: path, registeredName, claimedTaxTreatment: treatment, legalBasis: basis, issuedAt: issued || null, expiresAt: expires || null, taxYear: year || null });
      setFile(null); setRegisteredName(""); setTreatment(""); setBasis(""); setIssued(""); setExpires(""); setYear("");
      const input = document.getElementById("tax-document-file") as HTMLInputElement | null; if (input) input.value = "";
      await load(); setNotice("Document submitted for manual review. Submission alone does not change tax treatment.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Document could not be submitted."); }
    finally { setBusy(false); }
  }
  const options: DocType[] = party === "freelancer" ? ["bir_cor", "vat_registration", "tax_exemption"] : ["bir_cor", "vat_registration", "tax_exemption", "business_tax_support"];
  return <section className="space-y-4 rounded-xl border p-4">
    <div><h3 className="font-semibold">Business tax documents</h3><p className="mt-1 text-sm text-muted-foreground">Upload supporting records for manual review. WorkSync does not verify BIR authenticity automatically. Uploading a TIN or document alone does not establish VAT registration or tax exemption.</p></div>
    {rows.map(row => <div key={row.document_id} className="flex flex-wrap justify-between gap-2 border-t pt-3 text-sm"><span>{row.party_type} · {labels[row.document_type]}{row.registered_name ? ` · ${row.registered_name}` : ""}{row.expires_at ? ` · expires ${row.expires_at}` : ""}</span><span className="capitalize">{row.status.replaceAll("_", " ")}{renewalNotice(row.expires_at,row.status) ? ` · ${renewalNotice(row.expires_at,row.status)}` : ""}</span>{row.review_reason && <p className="w-full text-muted-foreground">Review: {row.review_reason}</p>}</div>)}
    {parties.length > 0 && <div className="grid gap-3 sm:grid-cols-2">
      {parties.length > 1 && <div className="space-y-2"><Label htmlFor="tax-document-party">Account role</Label><StyledSelect id="tax-document-party" value={party} onChange={event => { const value = event.target.value as Party; setParty(value); if (value === "freelancer" && type === "business_tax_support") setType("bir_cor"); }}>{parties.map(value => <option key={value} value={value}>{value}</option>)}</StyledSelect></div>}
      <div className="space-y-2"><Label htmlFor="tax-document-type">Document type</Label><StyledSelect id="tax-document-type" value={type} onChange={event => setType(event.target.value as DocType)}>{options.map(value => <option key={value} value={value}>{labels[value]}</option>)}</StyledSelect></div>
      {type === "bir_cor" && <div className="space-y-2"><Label htmlFor="tax-registered-name">Registered name on COR</Label><Input id="tax-registered-name" value={registeredName} maxLength={200} onChange={event => setRegisteredName(event.target.value)} /></div>}
      {type === "tax_exemption" && <><div className="space-y-2"><Label htmlFor="tax-treatment">Claimed tax treatment</Label><Input id="tax-treatment" value={treatment} maxLength={300} onChange={event => setTreatment(event.target.value)} placeholder="Describe the treatment being requested" /></div><div className="space-y-2"><Label htmlFor="tax-basis">Stated legal basis</Label><Input id="tax-basis" value={basis} maxLength={1000} onChange={event => setBasis(event.target.value)} placeholder="Regulation, ruling, or other basis for review" /></div></>}
      <div className="space-y-2"><Label htmlFor="tax-document-issued">Issue date (if shown)</Label><Input id="tax-document-issued" type="date" value={issued} onChange={event => setIssued(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="tax-document-expiry">Expiry date (if shown)</Label><Input id="tax-document-expiry" type="date" value={expires} onChange={event => setExpires(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="tax-document-year">Tax year (if applicable)</Label><Input id="tax-document-year" type="number" min="2024" max={new Date().getFullYear() + 1} value={year} onChange={event => setYear(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="tax-document-file">Supporting document</Label><Input id="tax-document-file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={event => setFile(event.target.files?.[0] ?? null)} /></div>
      <div className="sm:col-span-2"><Button type="button" disabled={!file || busy} onClick={() => void submit()}>{busy ? "Submitting…" : "Submit for review"}</Button></div>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-primary">{notice}</p>}
  </section>;
}





