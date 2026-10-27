"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { createCommunityPost, type CommunityCategory } from "@/services/community/communityService";

const MAX_IMAGES = 4;
const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function CommunityPostComposer({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (postId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<CommunityCategory>("question");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagText, setTagText] = useState("");
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const previewUrls = useRef<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  function reset() {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current = [];
    setCategory("question"); setTitle(""); setBody(""); setTagText(""); setImages([]); setError("");
  }
  function addFiles(selected: FileList | null) {
    if (!selected) return;
    const next = [...images];
    for (const file of Array.from(selected)) {
      if (!IMAGE_TYPES.has(file.type) || file.size > MAX_BYTES || file.size <= 0) {
        setError("Choose JPEG, PNG, or WebP images up to 5 MB each.");
        continue;
      }
      if (next.length >= MAX_IMAGES) {
        setError(`Attach up to ${MAX_IMAGES} images.`);
        break;
      }
      const preview = URL.createObjectURL(file);
      previewUrls.current.push(preview);
      next.push({ file, preview });
    }
    setImages(next);
  }
  async function submit() {
    setBusy(true); setError("");
    try {
      const postId = await createCommunityPost({
        category, title, body,
        tags: tagText.split(",").map((tag) => tag.trim()).filter(Boolean),
        files: images.map((image) => image.file),
      });
      reset(); onOpenChange(false); onCreated(postId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Your post could not be published.");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) { onOpenChange(next); if (!next) reset(); } }}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Create a community post</DialogTitle>
          <DialogDescription>Ask a question or share something useful with WorkSync members.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium" htmlFor="community-category">
            Post type
            <select id="community-category" className="h-10 w-full rounded-md border bg-background px-3" value={category} onChange={(event) => setCategory(event.target.value as CommunityCategory)}>
              <option value="question">Question</option><option value="discussion">Discussion</option><option value="tips">Tips &amp; Advice</option><option value="general">General</option>
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium" htmlFor="community-title">
            Title
            <input id="community-title" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What would you like to ask or share?" className="h-10 w-full rounded-md border bg-background px-3 font-normal" />
            <span className="block text-right text-xs font-normal text-muted-foreground">{title.length}/160</span>
          </label>
          <label className="block space-y-1.5 text-sm font-medium" htmlFor="community-body">
            Post
            <Textarea id="community-body" maxLength={8000} rows={6} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add context and details…" />
            <span className="block text-right text-xs font-normal text-muted-foreground">{body.length}/8,000</span>
          </label>
          <label className="block space-y-1.5 text-sm font-medium" htmlFor="community-tags">
            Topics <span className="font-normal text-muted-foreground">(comma separated, up to 5)</span>
            <input id="community-tags" value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="design, freelancing" className="h-10 w-full rounded-md border bg-background px-3 font-normal" />
          </label>
          <div>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy || images.length >= MAX_IMAGES}>
              <ImagePlus className="mr-2 size-4" /> Add images ({images.length}/{MAX_IMAGES})
            </Button>
            {!!images.length && <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{images.map(({ preview }, index) => <div key={preview} className="relative aspect-square overflow-hidden rounded-lg border"><Image src={preview} alt={`Selected attachment ${index + 1}`} fill unoptimized className="object-cover" /><button type="button" aria-label={`Remove image ${index + 1}`} className="absolute right-1 top-1 rounded-full bg-background p-1" onClick={() => { const [removed] = images.filter((_, itemIndex) => itemIndex === index); if (removed) { URL.revokeObjectURL(removed.preview); previewUrls.current = previewUrls.current.filter((url) => url !== removed.preview); } setImages((current) => current.filter((_, itemIndex) => itemIndex !== index)); }}><X className="size-4" /></button></div>)}</div>}
            <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG, or WebP; maximum 5 MB each.</p>
          </div>
          {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={busy || title.trim().length < 5 || body.trim().length < 10} onClick={() => void submit()}>{busy ? "Publishing…" : "Publish post"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
