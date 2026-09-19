"use client";
import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export default function SampleAttachments({
  files,
  download = false,
}: {
  files: string[];
  download?: boolean;
}) {
  return (
    <div className="space-y-3">
      {files.map((file) => (
        <div
          key={file}
          className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border bg-muted/50 p-3"
        >
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 break-words text-sm">{file}</span>
          {download ? (
            <Button
              variant="outline"
              disabled
              title="No document file was supplied with this sample"
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          ) : (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">View</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{file}</DialogTitle>
                  <DialogDescription>
                    This is a sample attachment entry. No file was supplied with
                    the layout, so there is no preview available.
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          )}
        </div>
      ))}
      {download && (
        <p className="text-xs text-muted-foreground">
          Downloads will be available when document files are connected.
        </p>
      )}
    </div>
  );
}
