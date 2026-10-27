"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bookmark, Check, Flag, Heart, MessageCircle, MoreHorizontal, Pencil, Share2, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { communityAuthorName, deleteCommunityPost, reportCommunityContent, setCommunityBookmark, setCommunityLike, updateCommunityPost, type CommunityPost } from "@/services/community/communityService";

const labels: Record<string, string> = { question: "Question", discussion: "Discussion", tips: "Tips & Advice", general: "General" };

function ReportDialog({ open, onOpenChange, postId, commentId }: {
  open: boolean; onOpenChange: (open: boolean) => void; postId?: string; commentId?: string;
}) {
  const [reason, setReason] = useState<"spam" | "harassment" | "inappropriate" | "misleading" | "other">("spam");
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogHeader><DialogTitle>Report this content</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <label className="block space-y-1 text-sm" htmlFor="community-report-reason">Reason<select id="community-report-reason" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}><option value="spam">Spam</option><option value="harassment">Harassment or abuse</option><option value="inappropriate">Inappropriate content</option><option value="misleading">Misleading content</option><option value="other">Other</option></select></label>
      <label className="block space-y-1 text-sm" htmlFor="community-report-details">More detail (optional)<Textarea id="community-report-details" maxLength={1500} value={explanation} onChange={(event) => setExplanation(event.target.value)} rows={4} /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await reportCommunityContent({ postId, commentId, reason, explanation }); onOpenChange(false); } catch (e) { setError(e instanceof Error ? e.message : "Report could not be submitted."); } finally { setBusy(false); } }}>{busy ? "Submitting…" : "Submit report"}</Button></div>
    </div>
  </DialogContent></Dialog>;
}

export function CommunityPostCard({ post, currentUserId, onChanged, full = false }: {
  post: CommunityPost; currentUserId: string; onChanged: (postId: string) => void; full?: boolean;
}) {
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes_count);
  const [bookmarked, setBookmarked] = useState(post.bookmarked);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [tagText, setTagText] = useState(post.tags.join(", "));
  const ownPost = currentUserId === post.author_id;
  const authorName = communityAuthorName(post.author);
  const initials = authorName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const target = `/home/community/${post.post_id}`;

  useEffect(() => {
    setLiked(post.liked);
    setLikes(post.likes_count);
    setBookmarked(post.bookmarked);
    setTitle(post.title);
    setBody(post.body);
    setTagText(post.tags.join(", "));
  }, [post]);

  async function toggleLike() {
    const next = !liked; setLiked(next); setLikes((value) => Math.max(0, value + (next ? 1 : -1))); setBusy(true); setActionError("");
    try { await setCommunityLike(post.post_id, next); } catch (e) { setLiked(!next); setLikes((value) => Math.max(0, value + (next ? -1 : 1))); setActionError(e instanceof Error ? e.message : "Like could not be saved."); }
    finally { setBusy(false); }
  }
  async function toggleBookmark() {
    const next = !bookmarked; setBookmarked(next); setBusy(true); setActionError("");
    try { await setCommunityBookmark(post.post_id, next); } catch (e) { setBookmarked(!next); setActionError(e instanceof Error ? e.message : "Bookmark could not be saved."); }
    finally { setBusy(false); }
  }

  return <>
    <Card className="gap-0 py-0">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <Link href={`/home/profile/${post.author_id}`} aria-label={`View ${authorName}'s profile`} className="shrink-0"><Avatar><AvatarImage src={post.author?.avatar_url ?? undefined} alt="" /><AvatarFallback>{initials}</AvatarFallback></Avatar></Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={`/home/profile/${post.author_id}`} className="font-medium hover:underline">{authorName}</Link>
              {post.role && <span className="text-xs capitalize text-muted-foreground">{post.role}</span>}
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <time className="text-xs text-muted-foreground" dateTime={post.created_at}>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</time>
            </div>
            <Badge variant="secondary" className="mt-1.5">{labels[post.category]}</Badge>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Post options"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ownPost ? <><DropdownMenuItem onClick={() => setEditOpen(true)}><Pencil className="mr-2 size-4" />Edit post</DropdownMenuItem><DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="mr-2 size-4" />Delete post</DropdownMenuItem></> : <DropdownMenuItem onClick={() => setReportOpen(true)}><Flag className="mr-2 size-4" />Report post</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="min-w-0 space-y-2">
          <Link href={target} className="block break-words text-lg font-semibold leading-snug hover:text-primary">{post.title}</Link>
          <p className={`whitespace-pre-wrap break-words text-sm text-muted-foreground ${full ? "" : "line-clamp-5"}`}>{post.body}</p>
          {!full && post.body.length > 300 && <Link href={target} className="text-sm font-medium text-primary hover:underline">Read more</Link>}
        </div>
        {!!post.tags.length && <div className="flex flex-wrap gap-2">{post.tags.map((tag) => <Badge key={tag} variant="outline">#{tag}</Badge>)}</div>}
        {!!post.images.length && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{post.images.map((image) => <button key={image.image_id} type="button" onClick={() => setImageUrl(image.url)} className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted"><Image src={image.url} alt="Community post attachment" fill unoptimized className="object-cover transition-transform hover:scale-[1.02]" /></button>)}</div>}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" disabled={busy} aria-pressed={liked} onClick={() => void toggleLike()}><Heart className={`mr-1.5 size-4 ${liked ? "fill-current text-rose-500" : ""}`} />{likes}</Button>
          <Button asChild variant="ghost" size="sm"><Link href={target}><MessageCircle className="mr-1.5 size-4" />{post.comments_count} {post.comments_count === 1 ? "comment" : "comments"}</Link></Button>
          <Button variant="ghost" size="sm" disabled={busy} aria-pressed={bookmarked} onClick={() => void toggleBookmark()}><Bookmark className={`mr-1.5 size-4 ${bookmarked ? "fill-current" : ""}`} />{bookmarked ? "Saved" : "Save"}</Button>
          <Button variant="ghost" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}${target}`); setActionError("Link copied."); } catch { setActionError("Unable to copy the post link."); } }}><Share2 className="mr-1.5 size-4" />Share</Button>
          {post.category === "question" && post.accepted_answer_comment_id && <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="size-4" />Answered</span>}
        </div>
        {actionError && <p role="status" className="text-xs text-muted-foreground">{actionError}</p>}
      </CardContent>
    </Card>

    <ReportDialog open={reportOpen} onOpenChange={setReportOpen} postId={post.post_id} />
    <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent><DialogHeader><DialogTitle>Edit post</DialogTitle></DialogHeader><div className="space-y-3"><label className="block space-y-1 text-sm" htmlFor={`edit-title-${post.post_id}`}>Title<input id={`edit-title-${post.post_id}`} maxLength={160} className="h-10 w-full rounded-md border bg-background px-3" value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="block space-y-1 text-sm" htmlFor={`edit-body-${post.post_id}`}>Post<Textarea id={`edit-body-${post.post_id}`} maxLength={8000} rows={6} value={body} onChange={(event) => setBody(event.target.value)} /></label><label className="block space-y-1 text-sm" htmlFor={`edit-tags-${post.post_id}`}>Topics<input id={`edit-tags-${post.post_id}`} className="h-10 w-full rounded-md border bg-background px-3" value={tagText} onChange={(event) => setTagText(event.target.value)} /></label><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button><Button onClick={async () => { setBusy(true); setActionError(""); try { await updateCommunityPost(post.post_id, { title, body, tags: tagText.split(",") }); setEditOpen(false); onChanged(post.post_id); } catch (e) { setActionError(e instanceof Error ? e.message : "Post could not be updated."); } finally { setBusy(false); } }} disabled={busy}>Save changes</Button></div></div></DialogContent></Dialog>
    <ConfirmActionDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete this post?" description="The post, its comments, bookmarks, likes, and attached images will be removed." confirmLabel={busy ? "Deleting…" : "Delete post"} destructive onConfirm={() => { setBusy(true); void deleteCommunityPost(post.post_id).then(() => onChanged(post.post_id)).catch((e: unknown) => setActionError(e instanceof Error ? e.message : "Post could not be deleted.")).finally(() => { setBusy(false); setDeleteOpen(false); }); }} />
    <Dialog open={!!imageUrl} onOpenChange={(open) => { if (!open) setImageUrl(null); }}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Community image</DialogTitle></DialogHeader>{imageUrl && <div className="relative mx-auto max-h-[75dvh] min-h-40 w-full"><Image src={imageUrl} alt="Expanded community post attachment" width={1200} height={900} unoptimized className="mx-auto max-h-[75dvh] w-auto object-contain" /></div>}</DialogContent></Dialog>
  </>;
}

export { ReportDialog };
