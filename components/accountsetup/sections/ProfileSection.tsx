import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Image from "next/image";
import { useRef } from "react";

import { Camera, ImageIcon, ImagePlus } from "lucide-react";

import { MAX_BIO_LENGTH } from "@/constants/account-setup.constants";

import type { ClientSetupValues } from "@/types/account-setup.types";

type TValues = ClientSetupValues;

type Props = {
  values: TValues;

  photoPreview: string;
  bannerPreview?: string;

  errors: Partial<Record<keyof TValues, string>>;

  onChange: (field: keyof TValues, value: TValues[keyof TValues]) => void;

  onPhotoSelect: (file: File) => void;

  onPhotoRemove: () => void;
  onBannerSelect?: (file: File) => void;
  profilePhotoRequired?: boolean;
};

export function ProfileSection({
  values,
  photoPreview,
  bannerPreview = "",
  errors,
  onChange,
  onPhotoSelect,
  onPhotoRemove,
  onBannerSelect,
  profilePhotoRequired = true,
}: Props) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  return (
    <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
      <div className="relative h-32 w-full overflow-hidden bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-600 sm:h-40 lg:h-44">
        {bannerPreview && <Image fill unoptimized sizes="100vw" src={bannerPreview} alt="Banner preview" className="object-cover object-center" />}
        {onBannerSelect && <>
          <Button type="button" size="sm" aria-invalid={!!errors.bannerImage} className={`absolute right-4 top-4 rounded-xl border-0 bg-white/20 text-white shadow-none backdrop-blur-sm hover:bg-white/30 hover:text-white ${errors.bannerImage ? "ring-2 ring-destructive" : ""}`} onClick={() => bannerInputRef.current?.click()}><ImagePlus className="size-4" />Edit cover</Button>
          <input ref={bannerInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) onBannerSelect(file); }} />
        </>}
      </div>
      <div className="px-4 pb-6 sm:px-6">
        <div className="flex flex-wrap items-end gap-2">
          <Avatar className="-mt-10 size-24 shrink-0 border-4 border-card shadow-sm">
            <AvatarImage src={photoPreview || "/default-avatar.svg"} alt="Profile preview" />
            <AvatarFallback><ImageIcon className="size-6 text-muted-foreground" /></AvatarFallback>
          </Avatar>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-1">
            <input ref={photoInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) onPhotoSelect(file); }} />
            <div className="space-y-1">
              <Button type="button" variant="link" size="sm" aria-invalid={!!errors.profilePhoto} className={`-ml-3 inline-flex cursor-pointer items-center px-3 font-semibold text-foreground no-underline hover:text-foreground hover:no-underline ${errors.profilePhoto ? "rounded border border-destructive" : ""}`} onClick={() => photoInputRef.current?.click()}><span className="inline-flex items-center gap-2 leading-none"><Camera className="size-4 shrink-0" /><span>Edit profile photo</span></span></Button>
              <p className="text-xs text-muted-foreground">JPG, PNG or WebP</p>
            </div>
            {values.profilePhoto && <Button type="button" variant="ghost" size="sm" onClick={onPhotoRemove} className="text-destructive">Remove selected photo</Button>}
            {profilePhotoRequired && <span className="text-xs text-muted-foreground">Required</span>}
          </div>
        </div>
        {errors.profilePhoto && <p className="mt-2 text-xs text-destructive">{errors.profilePhoto}</p>}
        {errors.bannerImage && <p className="mt-2 text-xs text-destructive">{errors.bannerImage}</p>}
        <div className="mt-6 space-y-5">
          <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="shortBio">
              Bio
            </Label>

            <span className="text-xs text-muted-foreground">
              {values.shortBio.length}/{MAX_BIO_LENGTH}
            </span>
          </div>

            <Textarea
            id="shortBio"
            aria-invalid={!!errors.shortBio}
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
      </div>
    </section>
  );
}
