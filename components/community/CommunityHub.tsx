"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bookmark, MessageSquareText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CommunityPostCard } from "@/components/community/CommunityPostCard";
import { CommunityPostComposer } from "@/components/community/CommunityPostComposer";
import { getCommunityFeed, type CommunityCategory, type CommunityPost, type CommunitySort } from "@/services/community/communityService";
import { supabase } from "@/lib/supabaseClient";

const PAGE_SIZE = 10;
const categories: { id: CommunityCategory | "all"; label: string }[] = [
  { id: "all", label: "All posts" }, { id: "question", label: "Questions" },
  { id: "discussion", label: "Discussions" }, { id: "tips", label: "Tips & Advice" },
  { id: "general", label: "General" },
];

export function CommunityHub() {
  const router = useRouter();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const postsRef = useRef(posts);
  postsRef.current = posts;
  const [currentUserId, setCurrentUserId] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [category, setCategory] = useState<CommunityCategory | "all">("all");
  const [sort, setSort] = useState<CommunitySort>("latest");
  const [savedOnly, setSavedOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async (append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError("");
    try {
      const result = await getCommunityFeed({
        category, sort, search, savedOnly, offset: append ? postsRef.current.length : 0, limit: PAGE_SIZE,
      });
      setPosts((current) => append ? [...current, ...result.posts] : result.posts);
      setTotal(result.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Community posts could not be loaded.");
      if (!append) setPosts([]);
    } finally { setLoading(false); setLoadingMore(false); }
  }, [category, sort, search, savedOnly]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => { if (active) { setCurrentUserId(data.user?.id ?? ""); setAuthReady(true); } });
    return () => { active = false; };
  }, []);
  useEffect(() => { void load(false); }, [load]);

  const refresh = useCallback(() => void load(false), [load]);
  function updatePost(postId: string) {
    setPosts((current) => current.filter((post) => post.post_id !== postId));
    refresh();
  }

  return <div className="mx-auto w-full max-w-5xl space-y-5">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-2xl font-semibold tracking-tight">Community</h1><p className="mt-1 text-sm text-muted-foreground">Ask questions, share ideas, and learn from other members.</p></div>
      {currentUserId ? <Button onClick={() => setComposerOpen(true)}><Plus className="mr-2 size-4" />Create post</Button> : <Button asChild disabled={!authReady}><Link href="/login?redirectTo=%2Fhome%2Fcommunity">Sign in to join</Link></Button>}
    </header>

    <Card><CardContent className="space-y-4 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1" htmlFor="community-search"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input id="community-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search posts, topics, or tags" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm" /></label>
        <label className="sr-only" htmlFor="community-sort">Sort posts</label><select id="community-sort" value={sort} onChange={(event) => setSort(event.target.value as CommunitySort)} className="h-10 w-full shrink-0 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-40"><option value="latest">Latest</option><option value="liked">Most liked</option><option value="discussed">Most discussed</option></select>
        <Button className="shrink-0" variant={savedOnly ? "secondary" : "outline"} onClick={() => setSavedOnly((value) => !value)} aria-pressed={savedOnly}><Bookmark className="mr-2 size-4" />{savedOnly ? "Showing saved posts" : "Show saved posts"}</Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by post type">{categories.map((item) => <Button key={item.id} size="sm" variant={category === item.id ? "default" : "outline"} className="shrink-0" aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</Button>)}</div>
    </CardContent></Card>

    {error && <Card className="border-destructive/40"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><p role="alert" className="text-sm text-destructive">{error}</p>{currentUserId ? <Button variant="outline" size="sm" onClick={refresh}>Retry</Button> : <Button asChild variant="outline" size="sm"><Link href="/login?redirectTo=%2Fhome%2Fcommunity">Sign in</Link></Button>}</CardContent></Card>}
    {loading ? <div className="space-y-4" aria-label="Loading community posts">{[0, 1, 2].map((item) => <Card key={item}><CardContent className="space-y-4 p-5"><div className="h-9 w-40 animate-pulse rounded bg-muted" /><div className="h-6 w-3/4 animate-pulse rounded bg-muted" /><div className="h-20 animate-pulse rounded bg-muted" /></CardContent></Card>)}</div> : !posts.length && !error ? <Card><CardContent className="flex flex-col items-center gap-3 p-10 text-center"><span className="rounded-full bg-primary/10 p-3 text-primary"><MessageSquareText className="size-6" /></span><h2 className="font-semibold">{savedOnly ? "No saved posts yet" : search ? "No matching posts" : "Start the conversation"}</h2><p className="max-w-md text-sm text-muted-foreground">{savedOnly ? "Save posts you want to come back to." : search ? "Try another search or filter." : "Ask a question or share an idea with the WorkSync community."}</p>{!savedOnly && currentUserId && <Button onClick={() => setComposerOpen(true)}><Plus className="mr-2 size-4" />Create post</Button>}</CardContent></Card> : <>
      <div className="space-y-4">{posts.map((post) => <CommunityPostCard key={post.post_id} post={post} currentUserId={currentUserId} onChanged={updatePost} />)}</div>
      <div className="flex flex-col items-center justify-between gap-3 border-t py-4 text-sm text-muted-foreground sm:flex-row"><span>Showing {posts.length} of {total} {total === 1 ? "post" : "posts"}</span>{posts.length < total && <Button variant="outline" onClick={() => void load(true)} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more"}</Button>}</div>
    </>}

    <CommunityPostComposer open={composerOpen} onOpenChange={setComposerOpen} onCreated={(postId) => router.push(`/home/community/${postId}`)} />
  </div>;
}
