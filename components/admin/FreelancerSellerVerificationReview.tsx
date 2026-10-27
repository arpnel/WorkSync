"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Requirement = { requirement_id: string; user_id: string; document_type: string; requirement_label: string; required_for_publishing: boolean; status: string; current_submission_id: string | null; review_reason: string };
type Submission = { submission_id: string; requirement_id: string; document_path: string; registered_name: string; status: string; submitted_at: string; review_reason: string; document_url: string | null };
type Event = { event_id: string; requirement_id: string; action: string; reason: string; created_at: string };
type Queue = { requirements: Requirement[]; submissions: Submission[]; events: Event[] };

export function FreelancerSellerVerificationReview() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");
  const [label, setLabel] = useState("Additional BIR seller document");
  const [required, setRequired] = useState(false);
  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Administrator sign-in required.");
    const response = await fetch("/api/admin/seller-verification", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? "Seller verification queue failed to load.");
    setQueue(data as Queue);
  }, []);
  useEffect(() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : "Queue unavailable.")); }, [load]);
  async function review(item: Requirement, action: "verified" | "rejected" | "not_applicable") {
    const text = reason[item.requirement_id]?.trim() ?? "";
    if (text.length < (action === "rejected" ? 12 : 2)) { setError(action === "rejected" ? "Rejection reasons must explain what needs correction." : "Enter a review reason."); return; }
    setBusy(item.requirement_id); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Administrator sign-in required.");
      const response = await fetch("/api/admin/seller-verification", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ requirementId: item.requirement_id, action, reason: text }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Review could not be saved.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Review could not be saved."); }
    finally { setBusy(""); }
  }
  async function configure() {
    if (!userId.trim() || label.trim().length < 2 || (reason.configure ?? "").trim().length < 2) { setError("Enter the freelancer user ID, requirement label, and configuration reason."); return; }
    setBusy("configure"); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Administrator sign-in required.");
      const response = await fetch("/api/admin/seller-verification", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "configure", userId: userId.trim(), documentType: "seller_registration_support", label: label.trim(), required, reason: reason.configure.trim() }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Requirement could not be configured.");
      setReason(prev => ({ ...prev, configure: "" })); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Requirement could not be configured."); }
    finally { setBusy(""); }
  }
  const submissions = queue?.submissions ?? [];
  return <div id="additional-seller-requirements" className="scroll-mt-6 space-y-4">
    <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Additional seller requirements</h2><p className="text-sm text-muted-foreground">Review account-specific requirements that apply beyond tax documents and identity verification.</p></div><Button variant="outline" onClick={() => void load().catch(cause => setError(cause instanceof Error ? cause.message : "Refresh failed."))}>Refresh</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <details className="rounded-xl border bg-card p-4"><summary className="cursor-pointer font-semibold">Configure an additional seller requirement</summary><div className="mt-3 space-y-3"><p className="text-sm text-muted-foreground">Use this only for an account-specific requirement beyond identity verification and Form 2303.</p><div className="grid gap-3 sm:grid-cols-2"><Input aria-label="Freelancer user ID" placeholder="Freelancer user ID" value={userId} onChange={event => setUserId(event.target.value)} /><Input aria-label="Requirement label" value={label} maxLength={200} onChange={event => setLabel(event.target.value)} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} />Required before service publishing</label><Input aria-label="Configuration reason" placeholder="Reason for this requirement" value={reason.configure ?? ""} maxLength={2000} onChange={event => setReason(prev => ({ ...prev, configure: event.target.value }))} /></div><Button disabled={busy === "configure"} onClick={() => void configure()}>Save requirement</Button></div></details>
    {queue?.requirements.map(item => {
      const current = submissions.find(row => row.submission_id === item.current_submission_id);
      const history = queue.events.filter(event => event.requirement_id === item.requirement_id);
      return <article key={item.requirement_id} className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-medium">{item.requirement_label}</h2><p className="text-xs text-muted-foreground">Freelancer user ID: {item.user_id}</p></div><span className="rounded-full border px-2 py-1 text-sm">{item.status.replaceAll("_", " ")}</span></div>
        {current && <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-sm"><p>Submitted {new Date(current.submitted_at).toLocaleString()}{current.registered_name ? ` · Registered name: ${current.registered_name}` : ""}</p>{current.document_url ? <a className="text-primary underline" href={current.document_url} target="_blank" rel="noreferrer">Open private document</a> : <p>Document link unavailable.</p>}{current.review_reason && <p>Previous feedback: {current.review_reason}</p>}</div>}
        {item.status === "pending" && <><Input aria-label="Review reason" placeholder="Explain your review decision" value={reason[item.requirement_id] ?? ""} onChange={event => setReason(prev => ({ ...prev, [item.requirement_id]: event.target.value }))} maxLength={2000} /><div className="flex flex-wrap gap-2"><Button disabled={busy === item.requirement_id} onClick={() => void review(item, "verified")}>Verify</Button><Button variant="destructive" disabled={busy === item.requirement_id} onClick={() => void review(item, "rejected")}>Reject with correction reason</Button><Button variant="outline" disabled={busy === item.requirement_id} onClick={() => void review(item, "not_applicable")}>Mark not applicable</Button></div></>}
        {item.status !== "pending" && <p className="text-sm text-muted-foreground">{item.review_reason || "No review reason."}</p>}
        {history.length > 0 && <details><summary className="cursor-pointer text-sm">Review history ({history.length})</summary><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{history.map(event => <li key={event.event_id}>{event.action} · {new Date(event.created_at).toLocaleString()} · {event.reason}</li>)}</ul></details>}
      </article>;
    })}
    {queue && queue.requirements.length === 0 && <p className="rounded-xl border p-6 text-center text-muted-foreground">No additional seller requirements are awaiting review.</p>}
  </div>;
}
