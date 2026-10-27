"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Flag, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabaseClient";

type Report = {
  report_id: string;
  post_id: string | null;
  comment_id: string | null;
  reason: string;
  explanation: string;
  status: string;
  review_notes: string;
  created_at: string;
  content: string;
};

export default function CommunityReportsReview() {
  const [rows, setRows] = useState<Report[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: queryError, count } = await supabase.from("community_reports")
      .select("report_id,post_id,comment_id,reason,explanation,status,review_notes,created_at", { count: "exact" })
      .order("created_at", { ascending: false }).range(offset, offset + 9);
    if (queryError) { setError(queryError.message); setRows([]); setTotal(0); setLoading(false); return; }
    const reports = (data ?? []) as Omit<Report, "content">[];
    const postIds = [...new Set(reports.map((row) => row.post_id).filter((id): id is string => Boolean(id)))];
    const commentIds = [...new Set(reports.map((row) => row.comment_id).filter((id): id is string => Boolean(id)))];
    const [posts, comments] = await Promise.all([
      postIds.length ? supabase.from("community_posts").select("post_id,title,body").in("post_id", postIds) : Promise.resolve({ data: [], error: null }),
      commentIds.length ? supabase.from("community_comments").select("comment_id,body").in("comment_id", commentIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (posts.error || comments.error) setError("Reported content could not be loaded.");
    const content = new Map<string, string>();
    for (const row of posts.data ?? []) content.set(row.post_id, `${row.title}\n${row.body}`);
    for (const row of comments.data ?? []) content.set(row.comment_id, row.body);
    setRows(reports.map((row) => ({ ...row, content: (row.post_id ? content.get(row.post_id) : content.get(row.comment_id ?? "")) ?? "Content is unavailable." })));
    setTotal(count ?? 0); setLoading(false);
  }, [offset]);
  useEffect(() => { void load(); }, [load]);

  async function decide(row: Report, action: "reviewed" | "dismissed" | "content_hidden") {
    setBusy(row.report_id); setError("");
    try {
      if (action === "content_hidden") {
        const target = row.post_id
          ? await supabase.from("community_posts").update({ status: "hidden" }).eq("post_id", row.post_id)
          : await supabase.from("community_comments").update({ status: "hidden" }).eq("comment_id", row.comment_id!);
        if (target.error) throw target.error;
      }
      const { error: updateError } = await supabase.from("community_reports").update({
        status: action, review_notes: notes[row.report_id]?.trim() ?? "",
      }).eq("report_id", row.report_id);
      if (updateError) throw updateError;
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "The report could not be updated.");
    } finally { setBusy(null); }
  }

  return <Card className="mb-5">
    <CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardTitle>Community reports</CardTitle><p className="mt-1 text-sm text-muted-foreground">Review member reports. Content is only hidden after an administrator decision.</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 size-4" />Refresh</Button></CardHeader>
    <CardContent className="space-y-4">
      {error && <p role="alert" className="break-words rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {loading ? <div className="space-y-3" aria-label="Loading community reports">{[1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-lg bg-muted" />)}</div> : rows.length ? <div className="space-y-3">{rows.map((row) => <article key={row.report_id} className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2"><Badge variant={row.status === "pending" ? "secondary" : "outline"}>{row.status.replaceAll("_", " ")}</Badge><span className="text-sm font-medium capitalize">{row.reason}</span><time className="ml-auto text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</time></div>
        <p className="whitespace-pre-wrap break-words text-sm">{row.content}</p>
        {row.explanation && <p className="rounded-md bg-muted/50 p-3 text-sm"><strong>Report details:</strong> {row.explanation}</p>}
        <label className="block space-y-1 text-sm" htmlFor={`community-report-note-${row.report_id}`}>Review note (optional)<Textarea id={`community-report-note-${row.report_id}`} rows={2} maxLength={1000} value={notes[row.report_id] ?? row.review_notes} onChange={(event) => setNotes((current) => ({ ...current, [row.report_id]: event.target.value }))} /></label>
        {row.status === "pending" && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy === row.report_id} onClick={() => void decide(row, "reviewed")}><Eye className="mr-1.5 size-4" />Mark reviewed</Button><Button size="sm" variant="outline" disabled={busy === row.report_id} onClick={() => void decide(row, "dismissed")}>Dismiss</Button><Button size="sm" variant="destructive" disabled={busy === row.report_id} onClick={() => void decide(row, "content_hidden")}><EyeOff className="mr-1.5 size-4" />Hide content</Button></div>}
      </article>)}</div> : <div className="rounded-lg border border-dashed p-7 text-center text-sm text-muted-foreground"><Flag className="mx-auto mb-2 size-5" />No community reports yet.</div>}
      <div className="flex items-center justify-between border-t pt-3 text-sm text-muted-foreground"><Button variant="outline" size="sm" disabled={offset===0 || loading} onClick={() => setOffset((value) => Math.max(0,value-10))}>Previous</Button><span>Page {Math.floor(offset/10)+1} · {total} reports</span><Button variant="outline" size="sm" disabled={offset+10>=total || loading} onClick={() => setOffset((value) => value+10)}>Next</Button></div>
    </CardContent>
  </Card>;
}
