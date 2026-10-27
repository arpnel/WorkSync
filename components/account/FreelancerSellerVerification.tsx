"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Requirement = { requirement_id: string; document_type: string; requirement_label: string; required_for_publishing: boolean; status: string; review_reason: string };
type Event = { event_id: string; action: string; new_status: string; reason: string; created_at: string };
type Data = { requirements: Requirement[]; events: Event[]; eligible: boolean; setupRequired?: boolean };
export type FreelancerSellerVerificationHandle = { submit: () => Promise<void>; refresh: () => Promise<void> };

export const FreelancerSellerVerification = forwardRef<FreelancerSellerVerificationHandle, { disabled?: boolean; compact?: boolean }>(function FreelancerSellerVerification({ disabled, compact }, ref) {
  const [data, setData] = useState<Data | null>(null);
  const [type, setType] = useState("seller_registration_support");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [accountRole, setAccountRole] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in again to check seller verification.");
    const response = await fetch("/api/freelancer-seller-verification", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error ?? "Seller verification is unavailable.");
    setData(result as Data);
  }, []);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in to manage seller verification.");
      const role = await supabase.from("Users").select("role").eq("user_id", user.id).maybeSingle();
      if (role.error) throw new Error("Unable to check account role.");
      if (alive) setAccountRole(role.data?.role ?? "");
      if (role.data?.role === "freelancer") await refresh();
    })().catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : "Seller verification is unavailable."); });
    return () => { alive = false; };
  }, [refresh]);

  const submit = useCallback(async () => {
    if (!file) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a file up to 5 MB.");
      const extension = file.name.split(".").at(-1)?.toLowerCase();
      if (!extension || !["pdf", "png", "jpg", "jpeg"].includes(extension)) throw new Error("Choose a PDF, PNG, or JPG file.");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired. Sign in again.");
      const auth = { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
      const ticketResponse = await fetch("/api/freelancer-seller-verification/upload-url", { method: "POST", headers: auth, body: JSON.stringify({ documentType: type, fileName: file.name, contentType: file.type, size: file.size }), cache: "no-store" });
      const ticket = await ticketResponse.json().catch(() => null);
      if (!ticketResponse.ok) throw new Error(ticket?.error ?? "Secure upload could not be prepared.");
      const uploaded = await supabase.storage.from("verification-documents").uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.contentType });
      if (uploaded.error) throw new Error("Private upload failed. Please try again.");
      const response = await fetch("/api/freelancer-seller-verification", { method: "POST", headers: auth, body: JSON.stringify({ documentType: type, documentPath: ticket.path, registeredName: "" }), cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Seller document could not be submitted.");
      setFile(null); setMessage("Document submitted for seller verification."); await refresh();
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "Seller document could not be submitted.";
      setError(text); throw new Error(text);
    } finally { setBusy(false); }
  }, [file, refresh, type]);
  useImperativeHandle(ref, () => ({ submit, refresh }), [refresh, submit]);

  const otherRequirements = data?.requirements.filter(item => item.document_type !== "bir_cor") ?? [];
  const requirement = otherRequirements.find(item => item.document_type === type);
  if (accountRole !== null && accountRole !== "freelancer") return null;
  const statusLabel = (status: string) => ({ not_submitted: "Not Submitted", pending: "Pending Review", verified: "Verified", rejected: "Rejected", not_applicable: "Not Applicable" }[status] ?? status);
  const content = <div className="space-y-4">
    {!compact && <p className="text-sm text-muted-foreground">These are any additional seller requirements configured for your account. Form 2303 is submitted once in the Seller Registration section above. Identity verification remains separate.</p>}
    <div className="space-y-3 rounded-lg border p-4">
      {otherRequirements.map(item => <div key={item.requirement_id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{item.requirement_label}{item.required_for_publishing ? " (required for services)" : " (optional)"}</span><span className="rounded-full border px-2 py-1">{statusLabel(item.status)}</span></div>)}
      {data && otherRequirements.length === 0 && <p className="text-sm text-muted-foreground">No additional seller documents are currently required.</p>}
      {data && !data.eligible && <p className="text-sm text-amber-600">Service submissions and publishing are unavailable until all required documents are verified.</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading seller verification status…</p>}
      {data?.setupRequired && <p className="text-sm text-muted-foreground">Save your freelancer profile below to enable seller-document submissions here.</p>}
      {otherRequirements.some(item => item.status === "not_submitted" || item.status === "rejected") && <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="seller-document-type">Document to submit</Label><select id="seller-document-type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={type} onChange={event => setType(event.target.value)} disabled={busy || disabled}>{otherRequirements.filter(item => item.status === "not_submitted" || item.status === "rejected").map(item => <option key={item.document_type} value={item.document_type}>{item.requirement_label}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="seller-document-file">Document file</Label><Input id="seller-document-file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={event => setFile(event.target.files?.[0] ?? null)} disabled={busy || disabled} /><p className="text-xs text-muted-foreground">Private file, PDF/JPG/PNG up to 5 MB.</p></div>
      </div>}
      {requirement?.status === "rejected" && <p className="text-sm text-destructive">Correction needed: {requirement.review_reason || "Review the document and submit a corrected copy."}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm text-emerald-600">{message}</p>}
      <div className="flex flex-wrap gap-2">{otherRequirements.some(item => item.status === "not_submitted" || item.status === "rejected") && <Button type="button" onClick={() => void submit().catch(() => undefined)} disabled={!file || busy || disabled || !requirement || (requirement.status !== "not_submitted" && requirement.status !== "rejected")}>{busy ? "Submitting…" : requirement?.status === "rejected" ? "Submit corrected document" : "Submit for review"}</Button>}<Button type="button" variant="outline" onClick={() => void refresh().catch(cause => setError(cause instanceof Error ? cause.message : "Refresh failed."))} disabled={busy}>Refresh status</Button></div>
    </div>
    {data?.events.length ? <div className="space-y-2"><h4 className="text-sm font-semibold">Review history</h4><ul className="space-y-2 text-sm text-muted-foreground">{data.events.map(event => <li key={event.event_id}>{statusLabel(event.new_status)} · {new Date(event.created_at).toLocaleString()}{event.reason ? ` — ${event.reason}` : ""}</li>)}</ul></div> : null}
  </div>;
  return <section className="space-y-3 rounded-xl border bg-card p-4" aria-busy={busy}><div><h3 className="font-semibold">Other Seller Requirements</h3>{!compact && <p className="text-sm text-muted-foreground">Review any additional account-specific requirements for offering freelancer services.</p>}</div>{content}</section>;
});
