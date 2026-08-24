"use client";

import { useRef, type ChangeEvent } from "react";
import { ImageIcon, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_MB,
  getMaxBytes,
} from "@/constants/account-setup.constants";

export interface ImageUploadProps {
  /** Current image preview URL (from createObjectURL or similar) */
  previewUrl: string;

  /** Called when an image is selected */
  onImageSelect: (file: File) => void;

  /** Called when the image is removed */
  onImageRemove: () => void;

  /** Error message */
  error?: string;

  /** Optional label */
  label?: string;

  /** Optional description */
  description?: string;

  /** Additional class names */
  className?: string;

  /** Whether the upload is disabled */
  disabled?: boolean;

  /** Size variant for the preview */
  previewSize?: "sm" | "default" | "lg";
}

export function ImageUpload({
  previewUrl,
  onImageSelect,
  onImageRemove,
  error,
  label,
  description,
  className,
  disabled = false,
  previewSize = "lg",
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    onImageSelect(selected);
    e.target.value = "";
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="text-sm font-medium">{label}</label>
      )}

      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />

      {previewUrl ? (
        <div className="flex items-center gap-4">
          <Avatar size={previewSize} className="size-20">
            <AvatarImage
              src={previewUrl}
              alt="Uploaded preview"
              className="object-cover"
            />
            <AvatarFallback>
              <ImageIcon className="size-6 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
            >
              Change Photo
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onImageRemove}
              disabled={disabled}
              className="text-destructive"
            >
              <X className="mr-1 size-3" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-sm transition-colors",
            "hover:bg-muted/40 hover:border-muted-foreground/30",
            disabled && "cursor-not-allowed opacity-50",
            error && "border-destructive/50"
          )}
        >
          <Upload className="size-6 text-muted-foreground" />
          <span className="font-medium text-muted-foreground">
            Upload a photo
          </span>
          <span className="text-xs text-muted-foreground">
            PNG, JPEG, or WebP (max {MAX_IMAGE_SIZE_MB}MB)
          </span>
        </button>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

