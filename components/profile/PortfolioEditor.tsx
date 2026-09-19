"use client";

import { useState, type FormEvent } from "react";
import type { PortfolioProject } from "@/types/profile/profile";
import {
  addPortfolioProject,
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
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [url, setUrl] = useState(project?.project_url ?? "");
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
    setBusy(true);
    try {
      const values = {
        title: title.trim(),
        description: description.trim() || null,
        project_url: url.trim() || null,
      };
      if (project) await updatePortfolioProject(project.portfolio_id, values);
      else await addPortfolioProject({ ...values, thumbnail_image_id: null });
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save this project. Please try again.",
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {project ? "Edit portfolio project" : "Add portfolio project"}
          </DialogTitle>
          <DialogDescription>
            Describe your work and add an optional link to the finished project.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
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
            <Button disabled={busy}>{busy ? "Saving…" : "Save project"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
