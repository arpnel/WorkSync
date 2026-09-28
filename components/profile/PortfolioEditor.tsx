"use client";

import Image from "next/image";
import { invalidatePageReads } from "@/lib/pageReadCache";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PortfolioProject } from "@/types/profile/profile";
import {
  addPortfolioProject,
  uploadPortfolioImage,
  updatePortfolioProject,
} from "@/services/profile/profileservice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function PortfolioEditor({
  project,
  onClose,
  onSaved,
}: {
  project: PortfolioProject | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const savedId = useRef(project?.portfolio_id);
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [url, setUrl] = useState(project?.project_url ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const imagePreview =
    preview ||
    (
      project?.images?.find(
        (image) => image.id === project.thumbnail_image_id,
      ) ?? project?.images?.[0]
    )?.image_url;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!title.trim()) return setError("Enter a project title.");
    if (url.trim()) {
      try {
        if (!["http:", "https:"].includes(new URL(url.trim()).protocol))
          throw new Error();
      } catch {
        return setError("Use a complete http or https project link.");
      }
    }
    if (
      file &&
      (!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 5 * 1024 * 1024)
    )
      return setError("Choose a JPG, PNG or WebP image up to 5 MB.");
    setBusy(true);
    try {
      const values = {
        title: title.trim(),
        description: description.trim() || null,
        project_url: url.trim() || null,
      };
      const saved = savedId.current
        ? await updatePortfolioProject(savedId.current, values)
        : await addPortfolioProject({ ...values, thumbnail_image_id: null });
      savedId.current = saved.portfolio_id;
      if (file) {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Sign in to upload images.");
        const image_url = await uploadPortfolioImage(user.id, file);
        const image = await supabase
          .from("portfolio_images")
          .insert({
            portfolio_id: saved.portfolio_id,
            image_url,
            display_order: 0,
          })
          .select("id")
          .single();
        if (image.error) throw image.error;
        const result = await supabase
          .from("portfolio")
          .update({ thumbnail_image_id: image.data.id })
          .eq("portfolio_id", saved.portfolio_id)
          .select("portfolio_id")
          .single();
        if (result.error) throw result.error;
      }
      invalidatePageReads();
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to finish saving this project. Saved fields are retained; retry to finish the image upload.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {project ? "Edit portfolio project" : "Add portfolio project"}
          </DialogTitle>
          <DialogDescription>
            Describe your work and add an optional link to the finished project.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="portfolio-image">Project image</Label>
              <Input
                id="portfolio-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {imagePreview && (
                <Image
                  width={600}
                  height={360}
                  unoptimized
                  className="max-h-56 w-full rounded-lg object-contain"
                  src={imagePreview}
                  alt="Project preview"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="portfolio-title">Title</Label>
              <Input
                id="portfolio-title"
                required
                maxLength={150}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portfolio-description">Description</Label>
              <Textarea
                id="portfolio-description"
                maxLength={5000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portfolio-url">Project link (optional)</Label>
              <Input
                id="portfolio-url"
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button disabled={busy}>
                {busy ? "Saving…" : "Save project"}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
