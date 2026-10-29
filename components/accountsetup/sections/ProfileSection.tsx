import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { ImageIcon } from "lucide-react";

import { MAX_BIO_LENGTH } from "@/constants/account-setup.constants";

import type { ClientSetupValues } from "@/types/account-setup.types";
import { AccountSetupFileDropzone } from "./AccountSetupFileDropzone";

type TValues = ClientSetupValues;

type Props = {
  values: TValues;

  photoPreview: string;

  errors: Partial<Record<keyof TValues, string>>;

  onChange: (field: keyof TValues, value: TValues[keyof TValues]) => void;

  onPhotoSelect: (file: File) => void;

  onPhotoRemove: () => void;
};

export function ProfileSection({
  values,
  photoPreview,
  errors,
  onChange,
  onPhotoSelect,
  onPhotoRemove,
}: Props) {
  return (
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <h3 className="text-sm font-semibold">Profile</h3>

        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-5">
        {/* Profile Photo */}

        <div className="space-y-2">
          <Label>
            Profile photo <span className="text-destructive">*</span>
          </Label>
          {photoPreview ? (
            <div className="flex items-center gap-4">
              <Avatar className="size-20">
                <AvatarImage src={photoPreview} alt="Profile preview" />

                <AvatarFallback>
                  <ImageIcon className="size-6 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>

              <div className="flex flex-col gap-2">
                {values.profilePhoto && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onPhotoRemove}
                    className="text-destructive"
                  >
                    Remove selected photo
                  </Button>
                )}
              </div>
            </div>
          ) : null}
          <AccountSetupFileDropzone
            accept="image/png,image/jpeg,image/webp"
            supportedTypes="PNG, JPG, or WebP (up to 5 MB)"
            onFiles={(files) => {
              if (files[0]) onPhotoSelect(files[0]);
            }}
          />

          {errors.profilePhoto && (
            <p className="text-xs text-destructive">{errors.profilePhoto}</p>
          )}
        </div>

        {/* Short Bio */}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="shortBio">
              Short Bio <span className="text-destructive">*</span>
            </Label>

            <span className="text-xs text-muted-foreground">
              {values.shortBio.length}/{MAX_BIO_LENGTH}
            </span>
          </div>

          <Textarea
            id="shortBio"
            rows={4}
            maxLength={MAX_BIO_LENGTH}
            value={values.shortBio}
            onChange={(event) => onChange("shortBio", event.target.value)}
            placeholder="Tell us about your expertise and experience..."
          />

          {errors.shortBio && (
            <p className="text-xs text-destructive">{errors.shortBio}</p>
          )}
        </div>
      </div>
    </section>
  );
}
