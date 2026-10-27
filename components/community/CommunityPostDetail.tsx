"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Flag, MessageSquareReply, Pencil, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabaseClient";
import { CommunityPostCard, ReportDialog } from "@/components/community/CommunityPostCard";
import { addCommunityComment, communityAuthorName, deleteCommunityComment, getCommunityPost, setAcceptedAnswer, updateCommunityComment, type CommunityComment } from "@/services/community/communityService";

function CommentItem({ comment, currentUserId, accepted, canAccept, allowReply = true, onChange, onReply }: {
  comment: CommunityComment; currentUserId: string; accepted: boolean; canAccept: boolean;
  allowReply?: boolean;
  onChange: () => void; onReply: (comment: CommunityComment) => void;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = communityAuthorName(comment.author);
  const own = comment.author_id === currentUserId;
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <>
    <div id={`community-comment-${comment.comment_id}`} className="flex min-w-0 gap-3">
      <Link href={`/home/profile/${comment.author_id}`} className="shrink-0" aria-label={`View ${name}'s profile`}><Avatar className="size-8"><AvatarImage src={comment.author?.avatar_url ?? undefined} alt="" /><AvatarFallback className="text-xs">{initials}</AvatarFallback></Avatar></Link>
      <div className="min-w-0 flex-1 rounded-xl bg-muted/50 p-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"><Link href={`/home/profile/${comment.author_id}`} className="font-medium hover:underline">{name}</Link>{comment.role && <span className="text-xs capitalize text-muted-foreground">{comment.role}</span>}<time className="text-xs text-muted-foreground" dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString()}</time>{accepted && <Badge className="ml-auto bg-emerald-600"><Check className="mr-1 size-3" />Accepted answer</Badge>}</div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm">{comment.body}</p>
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
        <div className="mt-2 flex flex-wrap gap-1">
          {allowReply && <Button variant="ghost" size="sm" onClick={() => onReply(comment)}><MessageSquareReply className="mr-1 size-4" />Reply</Button>}
          {canAccept && <Button variant="ghost" size="sm" onClick={async () => { setBusy(true); setError(""); try { await setAcceptedAnswer(comment.post_id, accepted ? null : comment.comment_id); onChange(); } catch (e) { setError(e instanceof Error ? e.message : "Answer status could not be changed."); } finally { setBusy(false); } }} disabled={busy}><Check className="mr-1 size-4" />{accepted ? "Unmark answer" : "Accept answer"}</Button>}
          {own ? <><Button variant="ghost" size="sm" onClick={() => { setBody(comment.body); setEditOpen(true); }}><Pencil className="mr-1 size-4" />Edit</Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="mr-1 size-4" />Delete</Button></> : <Button variant="ghost" size="sm" onClick={() => setReportOpen(true)}><Flag className="mr-1 size-4" />Report</Button>}
        </div>
      </div>
    </div>
    <ReportDialog open={reportOpen} onOpenChange={setReportOpen} commentId={comment.comment_id} />
    <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent><DialogHeader><DialogTitle>Edit comment</DialogTitle></DialogHeader><div className="space-y-3"><Textarea maxLength={3000} rows={5} value={body} onChange={(event) => setBody(event.target.value)} aria-label="Comment text" />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button><Button disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await updateCommunityComment(comment.comment_id, body); setEditOpen(false); onChange(); } catch (e) { setError(e instanceof Error ? e.message : "Comment could not be updated."); } finally { setBusy(false); } }}>Save</Button></div></div></DialogContent></Dialog>
    <ConfirmActionDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete this comment?" description="This comment and any replies to it will be removed." confirmLabel="Delete comment" destructive onConfirm={() => { setBusy(true); void deleteCommunityComment(comment.comment_id, comment.post_id).then(onChange).catch((e: unknown) => setError(e instanceof Error ? e.message : "Comment could not be deleted.")).finally(() => { setBusy(false); setDeleteOpen(false); }); }} />
  </>;
}

export function CommunityPostDetail({ postId }: { postId: string }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof getCommunityPost>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [replyTarget, setReplyTarget] = useState<CommunityComment | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setError("");
    try { setResult(await getCommunityPost(postId)); }
    catch (e) { setError(e instanceof Error ? e.message : "This post could not be loaded."); }
    finally { setLoading(false); }
  }, [postId]);
  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => { if (alive) setCurrentUserId(data.user?.id ?? ""); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const comments = useMemo(() => result?.comments ?? [], [result?.comments]);
  const topLevel = useMemo(() => comments.filter((comment) => !comment.parent_comment_id), [comments]);
  const replies = useMemo(() => comments.filter((comment) => comment.parent_comment_id), [comments]);
  const post = result?.post;

  if (loading) return <div className="mx-auto max-w-3xl space-y-4" aria-label="Loading community post"><div className="h-10 animate-pulse rounded-lg bg-muted" /><div className="h-72 animate-pulse rounded-2xl bg-muted" /><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>;
  if (error || !post) return <section className="mx-auto max-w-3xl space-y-4"><Button asChild variant="ghost"><Link href="/home/community"><ArrowLeft className="mr-2 size-4" />Community</Link></Button><Card><CardContent className="p-5"><p role="alert" className="text-sm text-destructive">{error || "This post is unavailable."}</p></CardContent></Card></section>;

  async function submitComment() {
    setSaving(true); setError("");
    try { await addCommunityComment(post!.post_id, commentBody, replyTarget?.comment_id); setCommentBody(""); setReplyTarget(null); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Comment could not be posted."); }
    finally { setSaving(false); }
  }

  return <div className="mx-auto max-w-3xl space-y-4">
    <Button asChild variant="ghost" className="-ml-3"><Link href="/home/community"><ArrowLeft className="mr-2 size-4" />Back to Community</Link></Button>
    <CommunityPostCard post={post} currentUserId={currentUserId} onChanged={() => void refresh()} full />
    <Card><CardContent className="space-y-5 p-4 sm:p-5">
      <div><h2 className="text-base font-semibold">Discussion</h2><p className="mt-1 text-sm text-muted-foreground">{comments.length} {comments.length === 1 ? "comment" : "comments"}</p></div>
      <div className="space-y-3">
        <Textarea value={commentBody} maxLength={3000} rows={3} placeholder={replyTarget ? `Replying to ${communityAuthorName(replyTarget.author)}` : "Write a comment…"} aria-label="Write a comment" onChange={(event) => setCommentBody(event.target.value)} />
        <div className="flex items-center justify-between gap-3"><div className="min-w-0 text-sm text-muted-foreground">{replyTarget && <span>Replying to {communityAuthorName(replyTarget.author)} · <button type="button" className="underline" onClick={() => setReplyTarget(null)}>Cancel reply</button></span>}</div><Button disabled={saving || !commentBody.trim()} onClick={() => void submitComment()}>{saving ? "Posting…" : "Post comment"}</Button></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      {!topLevel.length ? <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">No comments yet. Start the conversation.</p> : <div className="space-y-5">{topLevel.map((comment) => {
        const accepted = post.accepted_answer_comment_id === comment.comment_id;
        return <div key={comment.comment_id} className="space-y-3"><CommentItem comment={comment} currentUserId={currentUserId} accepted={accepted} canAccept={post.category === "question" && post.author_id === currentUserId} onChange={() => void refresh()} onReply={setReplyTarget} />
          {replies.filter((reply) => reply.parent_comment_id === comment.comment_id).map((reply) => <div key={reply.comment_id} className="ml-7 border-l-2 pl-3 sm:ml-11 sm:pl-4"><CommentItem comment={reply} currentUserId={currentUserId} accepted={post.accepted_answer_comment_id === reply.comment_id} canAccept={post.category === "question" && post.author_id === currentUserId} allowReply={false} onChange={() => void refresh()} onReply={setReplyTarget} /></div>)}
        </div>;
      })}</div>}
    </CardContent></Card>
  </div>;
}
