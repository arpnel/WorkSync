"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Document = { label: string; path: string; bucket: string };
export function DocumentsEditor({
  userId,
  documents,
  onClose,
  onSaved,
}: {
  userId: string;
  documents: Document[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kept, setKept] = useState(documents);
  const [resume, setResume] = useState<File[]>([]);
  const [samples, setSamples] = useState<File[]>([]);
  const [certificates, setCertificates] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    const files = [...resume, ...samples, ...certificates];
    if (resume.some((file) => file.type !== "application/pdf")) {
      setError("Your CV or resume must be a PDF file.");
      return;
    }
    if (
      files.some(
        (file) =>
          ![
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp",
          ].includes(file.type) || file.size > 5 * 1024 * 1024,
      )
    ) {
      setError("Choose PDF, JPG, PNG or WebP files up to 5 MB each.");
      return;
    }
    setBusy(true);
    setError("");
    const uploaded: { bucket: string; path: string }[] = [];
    try {
      async function upload(bucket: string, folder: string, file: File) {
        const extension = {
          "application/pdf": "pdf",
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
        }[file.type];
        const path = `${userId}/${folder}/${crypto.randomUUID()}.${extension}`;
        const result = await supabase.storage
          .from(bucket)
          .upload(path, file, { contentType: file.type });
        if (result.error) throw result.error;
        uploaded.push({ bucket, path });
        return path;
      }
      async function uploadMany(bucket: string, folder: string, files: File[]) {
        const results = await Promise.allSettled(
          files.map((file) => upload(bucket, folder, file)),
        );
        const failed = results.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
        return results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
      }
      const nextResume = resume[0]
        ? await upload("verification-documents", "resume", resume[0])
        : (kept.find((doc) => doc.label === "Resume / CV")?.path ?? null);
      const nextSamples = await uploadMany(
        "verification-documents",
        "portfolio",
        samples,
      );
      const nextCertificates = await uploadMany(
        "verification-documents",
        "certifications",
        certificates,
      );
      const result = await supabase
        .from("freelancer_profiles")
        .update({
          resume_url: nextResume,
          portfolio_sample_urls: [
            ...kept
              .filter((doc) => doc.label.startsWith("Portfolio"))
              .map((doc) => doc.path),
            ...nextSamples,
          ],
          certification_urls: [
            ...kept
              .filter((doc) => doc.label.startsWith("Certification"))
              .map((doc) => doc.path),
            ...nextCertificates,
          ],
        })
        .eq("user_id", userId)
        .select("freelancer_id")
        .single();
      if (result.error) throw result.error;
    } catch (cause) {
      await Promise.all(
        uploaded.map((file) =>
          supabase.storage.from(file.bucket).remove([file.path]),
        ),
      );
      setError(
        cause instanceof Error ? cause.message : "Unable to save documents.",
      );
      return;
    } finally {
      setBusy(false);
    }
    // A refresh callback failure must not delete files already saved to the profile.
    try {
      await onSaved();
    } catch {
      setError(
        "Documents were saved, but the profile could not refresh. Reload the page to see your changes.",
      );
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Edit supporting documents</DialogTitle>
          <DialogDescription>
            Preview files on your profile. Changes are applied when you save.
          </DialogDescription>
        </DialogHeader>
        {kept.map((doc) => (
          <div
            key={doc.path}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span>{doc.label}</span>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                setKept((rows) => rows.filter((row) => row.path !== doc.path))
              }
            >
              Remove
            </Button>
          </div>
        ))}
        {[
          {
            label: "Replace resume",
            files: setResume,
            selectedFiles: resume,
            multiple: false,
            accept: "application/pdf",
          },
          {
            label: "Add portfolio samples",
            files: setSamples,
            selectedFiles: samples,
            multiple: true,
            accept: "application/pdf,image/jpeg,image/png,image/webp",
          },
          {
            label: "Add certifications",
            files: setCertificates,
            selectedFiles: certificates,
            multiple: true,
            accept: "application/pdf,image/jpeg,image/png,image/webp",
          },
        ].map((field) => (
          <div className="space-y-2" key={field.label}>
            <Label htmlFor={field.label}>{field.label}</Label>
            <input
              id={field.label}
              type="file"
              className="hidden"
              disabled={busy}
              multiple={field.multiple}
              accept={field.accept}
              onChange={(e) => {
                field.files(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => document.getElementById(field.label)?.click()}
            >
              {field.selectedFiles.length ? "Add more files" : "Choose files"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {field.selectedFiles.length
                ? field.selectedFiles.map((file) => file.name).join(", ")
                : field.multiple
                  ? "PDF, JPG, PNG or WebP, up to 5 MB each."
                  : "PDF only, up to 5 MB."}
            </p>
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
