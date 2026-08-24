"use client";

import type { ChangeEvent } from "react";
import { useState } from "react";

import type { ServiceFormValues } from "../types/service-form.types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  ImageIcon,
  Trash2,
  Upload,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type ServiceImageSectionProps = {
  values: ServiceFormValues;
  errors: Partial<Record<keyof ServiceFormValues, string>>;
  onChange: (values: Partial<ServiceFormValues>) => void;
};

export function ServiceImageSection({
  values,
  errors,
  onChange,
}: ServiceImageSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleMediaChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files || []);

    if (!files.length) return;

    const urls = files.map((file) =>
      URL.createObjectURL(file)
    );

    onChange({
      mediaFiles: [
        ...values.mediaFiles,
        ...files,
      ],
      mediaUrls: [
        ...values.mediaUrls,
        ...urls,
      ],
    });
  };

  const removeCurrentMedia = () => {
    const newFiles = [...values.mediaFiles];
    const newUrls = [...values.mediaUrls];

    newFiles.splice(currentIndex, 1);
    newUrls.splice(currentIndex, 1);

    setCurrentIndex(0);

    onChange({
      mediaFiles: newFiles,
      mediaUrls: newUrls,
    });
  };

  const nextMedia = () => {
    setCurrentIndex((prev) =>
      prev === values.mediaUrls.length - 1
        ? 0
        : prev + 1
    );
  };

  const previousMedia = () => {
    setCurrentIndex((prev) =>
      prev === 0
        ? values.mediaUrls.length - 1
        : prev - 1
    );
  };

  const currentMedia =
    values.mediaUrls[currentIndex];

  return (
    <div className="space-y-5">
      <div>
        <Label className="text-sm font-semibold">
          Service Media
        </Label>

        <p className="mt-1 text-xs text-muted-foreground">
          Upload images or videos showcasing your service.
        </p>
      </div>

      <Input
        id="service-media"
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleMediaChange}
      />

      {!currentMedia ? (
        <button
          type="button"
          onClick={() =>
            document
              .getElementById("service-media")
              ?.click()
          }
          className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition hover:bg-muted/40"
        >
          <Upload className="mb-3 h-8 w-8 text-muted-foreground" />

          <p className="font-medium">
            Upload images or videos
          </p>
        </button>
      ) : (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-xl border">
            {values.mediaFiles[currentIndex]?.type.startsWith(
              "video"
            ) ? (
              <video
                src={currentMedia}
                controls
                className="aspect-video w-full object-contain bg-muted"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentMedia}
                alt="Service preview"
                className="aspect-video w-full object-contain bg-muted"
              />
            )}

            {values.mediaUrls.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={previousMedia}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background p-2 shadow"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={nextMedia}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background p-2 shadow"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />

              <span>
                {currentIndex + 1} /
                {values.mediaFiles.length}
              </span>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  document
                    .getElementById("service-media")
                    ?.click()
                }
              >
                Add More
              </Button>

              <Button
                type="button"
                variant="destructive"
                onClick={removeCurrentMedia}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}

      {errors.mediaUrls && (
        <p className="text-xs text-destructive">
          {errors.mediaUrls}
        </p>
      )}
    </div>
  );
}