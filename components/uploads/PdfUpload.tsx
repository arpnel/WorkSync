"use client";

import { FileText } from "lucide-react";
import { FileUpload, type FileUploadProps } from "./FileUpload";
import { ACCEPTED_PDF_TYPES, getMaxBytes, MAX_PDF_SIZE_MB } from "@/constants/account-setup.constants";

export interface PdfUploadProps
  extends Omit<
    FileUploadProps,
    "accept" | "maxSizeBytes" | "icon" | "placeholder"
  > {}

export function PdfUpload(props: PdfUploadProps) {
  return (
    <FileUpload
      {...props}
      accept={ACCEPTED_PDF_TYPES.join(",")}
      maxSizeBytes={getMaxBytes(MAX_PDF_SIZE_MB)}
      placeholder="Upload a PDF document"
      icon={<FileText className="size-6 text-muted-foreground" />}
    />
  );
}

