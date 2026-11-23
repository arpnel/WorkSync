"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Check, FileText, LoaderCircle, UploadCloud, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ClientType = "individual" | "organization";
type ClientTaxDocument = {
  document_id: string;
  party_type: "client" | "freelancer";
  document_type: string;
  registered_name: string;
  status: string;
  submitted_at: string;
  review_reason: string;
};

function documentStatus(status: string) {
  if (status === "verified") return "Approved";
  if (status === "pending") return "Pending review";
  if (status === "rejected") return "Changes requested";
  return status.replaceAll("_", " ");
}

function statusStyle(status: string) {
  if (status === "verified") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "pending") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (status === "rejected") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
}

export default function ClientBusinessDocumentation() {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [clientType, setClientType] = useState<ClientType>("individual");
  const [savedClientType, setSavedClientType] = useState<ClientType>("individual");
  const [organizationName, setOrganizationName] = useState("");
  const [savedOrganizationName, setSavedOrganizationName] = useState("");
  const [organizationAddress, setOrganizationAddress] = useState("");
  const [savedOrganizationAddress, setSavedOrganizationAddress] = useState("");
  const [document, setDocument] = useState<ClientTaxDocument | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in to manage client documentation.");
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const profileResponse = await fetch("/api/client/documentation-profile", { headers, cache: "no-store" });
    if (profileResponse.status === 403) {
      setAvailable(false);
      return;
    }
    const profile = await profileResponse.json().catch(() => null);
    if (!profileResponse.ok) throw new Error(profile?.error || "Client account settings could not be loaded.");
    const nextType: ClientType = profile.clientType === "organization" ? "organization" : "individual";
    setAvailable(true);
    setClientType(nextType);
    setSavedClientType(nextType);
    setOrganizationName(profile.organizationName ?? "");
    setSavedOrganizationName(profile.organizationName ?? "");
    setOrganizationAddress(profile.organizationAddress ?? "");
    setSavedOrganizationAddress(profile.organizationAddress ?? "");

    const documentsResponse = await fetch("/api/tax-documents", { headers, cache: "no-store" });
    const body = await documentsResponse.json().catch(() => null);
    if (!documentsResponse.ok) throw new Error(body?.error || "Client business documents could not be loaded.");
    const latest = ((body?.documents ?? []) as ClientTaxDocument[])
      .filter((item) => item.party_type === "client" && item.document_type === "bir_cor")
      .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))[0] ?? null;
    setDocument(latest);
  }, []);

  useEffect(() => {
    let active = true;
    void load().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Client documentation could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [load]);

  const profileDirty = clientType !== savedClientType
    || organizationName !== savedOrganizationName
    || organizationAddress !== savedOrganizationAddress;
  const businessProfileSaved = clientType === "organization" && !profileDirty;

  async function saveProfile() {
    if (saving) return;
    setError("");
    setNotice("");
    if (clientType === "organization" && (!organizationName.trim() || !organizationAddress.trim())) {
      setError("Enter your organization's registered name and address.");
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired. Sign in again.");
      const response = await fetch("/api/client/documentation-profile", {
        method: "PUT",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ clientType, organizationName, organizationAddress }),
        cache: "no-store",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Client account type could not be saved.");
      setClientType(result.clientType);
      setSavedClientType(result.clientType);
      setOrganizationName(result.organizationName ?? "");
      setSavedOrganizationName(result.organizationName ?? "");
      setOrganizationAddress(result.organizationAddress ?? "");
      setSavedOrganizationAddress(result.organizationAddress ?? "");
      setNotice(result.clientType === "organization" ? "Business or organization account details saved." : "Individual client account saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Client account type could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function submitDocument() {
    if (!file || uploading || !businessProfileSaved) return;
    setError("");
    setNotice("");
    if (file.size > 5 * 1024 * 1024) {
      setError("Choose a document up to 5 MB.");
      return;
    }
    const extension = file.name.split(".").at(-1)?.toLowerCase();
    if (!extension || !["pdf", "png", "jpg", "jpeg"].includes(extension)) {
      setError("Choose a PDF, JPG, or PNG document.");
      return;
    }
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired. Sign in again.");
      const headers = { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
      const preparedResponse = await fetch("/api/tax-documents/upload-url", {
        method: "POST",
        headers,
        body: JSON.stringify({ partyType: "client", documentType: "bir_cor", fileName: file.name, contentType: file.type, size: file.size }),
        cache: "no-store",
      });
      const prepared = await preparedResponse.json().catch(() => null);
      if (!preparedResponse.ok) throw new Error(prepared?.error || "Secure document upload could not be prepared.");
      const uploaded = await supabase.storage.from("verification-documents").uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: prepared.contentType });
      if (uploaded.error) throw new Error("Private document upload failed. Please try again.");
      const submittedResponse = await fetch("/api/tax-documents", {
        method: "POST",
        headers,
        body: JSON.stringify({ partyType: "client", documentType: "bir_cor", documentPath: prepared.path, registeredName: organizationName.trim() }),
        cache: "no-store",
      });
      const submitted = await submittedResponse.json().catch(() => null);
      if (!submittedResponse.ok) throw new Error(submitted?.error || "Document could not be submitted for review.");
      setFile(null);
      setNotice("Form 2303 was submitted for administrator review.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Business document could not be submitted.");
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Loading client documentation…</div>;
  if (!available && !error) return null;

  return <section className="space-y-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-6" aria-labelledby="client-documentation-heading">
    <header>
      <h2 id="client-documentation-heading" className="text-lg font-semibold">Client account type</h2>
      <p className="mt-1 text-sm text-muted-foreground">Choose whether you hire as an individual or on behalf of a business or organization. Business documents are reviewed by WorkSync administrators.</p>
    </header>

    <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Client account type">
      {([[
        "individual", "Individual", "I hire for myself or a personal project.", UserRound,
      ], [
        "organization", "Business or organization", "I hire on behalf of a registered company, nonprofit, or other organization.", Building2,
      ]] as const).map(([value, label, description, Icon]) => (
        <button key={value} type="button" aria-pressed={clientType === value} onClick={() => { setClientType(value); setError(""); setNotice(""); }} className={`min-h-28 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${clientType === value ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-muted/20 hover:border-primary/50"}`}>
          <span className="flex items-center justify-between"><Icon className={`size-5 ${clientType === value ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />{clientType === value && <Check className="size-4 text-primary" aria-hidden="true" />}</span>
          <span className="mt-3 block text-sm font-semibold">{label}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
        </button>
      ))}
    </div>

    {clientType === "organization" && <div className="grid gap-4 rounded-xl border bg-muted/10 p-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="client-organization-name">Registered business or organization name</Label>
        <Input id="client-organization-name" value={organizationName} maxLength={200} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Name shown on registration documents" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="client-organization-address">Registered address</Label>
        <Input id="client-organization-address" value={organizationAddress} maxLength={500} onChange={(event) => setOrganizationAddress(event.target.value)} placeholder="Business or organization address" />
      </div>
      <div className="flex items-center justify-between gap-3 sm:col-span-2">
        <p className="text-xs text-muted-foreground">Save these details before submitting registration documents.</p>
        <Button type="button" onClick={() => void saveProfile()} disabled={saving || !profileDirty}>
          {saving ? <><LoaderCircle className="size-4 animate-spin" />Saving…</> : "Save business account"}
        </Button>
      </div>
    </div>}

    {clientType === "individual" && profileDirty && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/10 p-4">
      <p className="text-sm text-muted-foreground">Save your choice to use an individual client account.</p>
      <Button type="button" onClick={() => void saveProfile()} disabled={saving}>{saving ? "Saving…" : "Save account type"}</Button>
    </div>}

    {clientType === "organization" && businessProfileSaved && <section className="space-y-4 rounded-xl border p-4" aria-label="Business registration document">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/50"><FileText className="size-4" aria-hidden="true" /></span>
          <div><h3 className="text-sm font-semibold">BIR Form 2303 (Certificate of Registration)</h3><p className="mt-1 text-xs text-muted-foreground">Upload the registration document for {organizationName}. PDF, JPG, or PNG up to 5 MB.</p></div>
        </div>
        {document && <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyle(document.status)}`}>{documentStatus(document.status)}</span>}
      </div>
      {document?.status === "pending" ? <p className="rounded-lg bg-amber-500/5 p-3 text-sm text-muted-foreground">Your document is awaiting administrator review.</p> : <div className="space-y-3">
        {document?.status === "rejected" && document.review_reason && <p className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">Review note: {document.review_reason}</p>}
        {document?.status === "verified" && <p className="rounded-lg bg-emerald-500/5 p-3 text-sm text-muted-foreground">Your latest registration document is approved. Submit an updated copy only if the registration changes.</p>}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="client-organization-document">Registration document</Label>
            <Input id="client-organization-document" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" disabled={uploading || document?.status === "pending"} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); setNotice(""); }} />
          </div>
          <Button type="button" onClick={() => void submitDocument()} disabled={!file || uploading || document?.status === "pending"}>
            {uploading ? <><LoaderCircle className="size-4 animate-spin" />Submitting…</> : <><UploadCloud className="size-4" />{document?.status === "verified" ? "Submit updated document" : "Submit for review"}</>}
          </Button>
        </div>
        {file && <p className="text-xs text-muted-foreground">Selected: {file.name}</p>}
      </div>}
    </section>}

    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-600">{notice}</p>}
  </section>;
}
