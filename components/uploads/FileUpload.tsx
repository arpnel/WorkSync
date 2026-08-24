"use client";

import { useRef, type ChangeEvent } from "react";
import { Upload, FileIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface FileUploadProps {
  /** Currently selected file or null */
  file: File | null;

  /** Called when a file is selected */
  onFileSelect: (file: File) => void;

  /** Called when the file is removed */
  onFileRemove: () => void;

  /** Accepted MIME types */
  accept: string;

  /** Max file size in bytes */
  maxSizeBytes: number;

  /** Placeholder text shown when no file is selected */
  placeholder?: string;

  /** Error message */
  error?: string;

  /** Optional label */
  label?: string;

  /** Optional description */
  description?: string;

  /** Additional class names */
  className?: string;

  /** Icon to show in the drop zone (default: Upload) */
  icon?: React.ReactNode;

  /** Whether the upload is disabled */
  disabled?: boolean;
}

export function FileUpload({
  file,
  onFileSelect,
  onFileRemove,
  accept,
  maxSizeBytes,
  placeholder = "Upload a file",
  error,
  label,
  description,
  className,
  icon,
  disabled = false,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.size > maxSizeBytes) {
      return;
    }
    onFileSelect(selected);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        accept={accept}
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />

      {file ? (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary/10">
            <FileIcon className="size-5 text-primary" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatSize(file.size)}
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onFileRemove}
            disabled={disabled}
            className="shrink-0"
          >
            <X className="size-4" />
          </Button>
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
          {icon ?? <Upload className="size-6 text-muted-foreground" />}
          <span className="font-medium text-muted-foreground">
            {placeholder}
          </span>
        </button>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

