"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { UploadCloud } from "lucide-react";

type Props = {
  accept: string;
  supportedTypes: string;
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
};

export function AccountSetupFileDropzone({
  accept,
  supportedTypes,
  onFiles,
  multiple = false,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length) onFiles(files);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) {
      const files = Array.from(event.dataTransfer.files);
      onFiles(multiple ? files : files.slice(0, 1));
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={handleChange}
        disabled={disabled}
        tabIndex={-1}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={handleDrop}
        disabled={disabled}
        className={`flex min-h-[76px] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-3 text-center transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50 ${dragging ? "border-primary bg-primary/5" : ""}`}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <UploadCloud className="size-4 shrink-0 text-emerald-500" />
          Drag &amp; drop your file or click to browse
        </span>
        <span className="text-xs text-muted-foreground">
          Supported: {supportedTypes}
        </span>
      </button>
    </>
  );
}
