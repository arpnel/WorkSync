"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Upload } from "lucide-react";
import ImageCropDialog from "./ImageCropDialog";
import { useImageCrop } from "@/hooks/profile/useImageCrop";
import type {
  Profile,
  UpdateProfilePayload,
} from "../../types/profile/profile";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  profile: Profile;

  onSave: (updates: UpdateProfilePayload) => Promise<boolean>;

  onAvatarUpdate?: (file: File) => Promise<boolean>;

  onBannerUpdate?: (file: File) => Promise<boolean>;
}

export default function EditProfileDialog({
  open,
  onOpenChange,
  profile,
  onSave,
  onAvatarUpdate,
  onBannerUpdate,
}: EditProfileDialogProps) {
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [uploadingBanner, setUploadingBanner] = useState(false);

  const [form, setForm] = useState({
    display_name: "",
    headline: "",
    bio: "",
    location: "",
    hourly_rate: "",
  });

  const {
    cropOpen,
    cropImage,
    cropType,

    avatarPreview,
    bannerPreview,

    pendingAvatar,
    pendingBanner,

    handleAvatarChange,
    handleBannerChange,

    handleCropComplete,
    closeCropper,

    resetImages,
  } = useImageCrop();

  useEffect(() => {
    if (!profile) return;

    setForm({
      display_name: profile.display_name ?? "",
      headline: profile.headline ?? "",
      bio: profile.bio ?? "",
      location: profile.location ?? "",
      hourly_rate: profile.hourly_rate?.toString() ?? "",
    });

    // Reset temporary images every time the dialog opens
    resetImages();
  }, [profile, open]);

  const avatar = avatarPreview ?? profile.avatar_url ?? undefined;
  const initials = `${profile.first_name} ${profile.last_name}`
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleSave = async () => {
    setSaving(true);

    if (pendingAvatar && onAvatarUpdate) {
      setUploadingAvatar(true);

      const ok = await onAvatarUpdate(pendingAvatar);

      setUploadingAvatar(false);

      if (!ok) {
        setSaving(false);
        return;
      }
    }

    if (pendingBanner && onBannerUpdate) {
      setUploadingBanner(true);

      const ok = await onBannerUpdate(pendingBanner);

      setUploadingBanner(false);

      if (!ok) {
        setSaving(false);
        return;
      }
    }

    const success = await onSave({
      display_name: form.display_name || null,
      headline: form.headline || null,
      bio: form.bio || null,
      location: form.location || null,
      hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
    });

    setSaving(false);

    if (success) {
      resetImages();

      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>

          <DialogDescription>
            Update your public profile, display name, profile picture, and
            banner.
          </DialogDescription>
        </DialogHeader>

        {/* Banner */}
        <div className="space-y-3">
          <Label>Banner</Label>

          <div className="relative h-52 overflow-hidden rounded-xl border bg-muted">
            {bannerPreview || profile.banner_url ? (
              <img
                src={bannerPreview ?? profile.banner_url!}
                alt="Banner"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-600" />
            )}

            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="absolute bottom-4 right-4"
              disabled={uploadingBanner}
              onClick={() => bannerInputRef.current?.click()}
            >
              {uploadingBanner ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Change Banner
                </>
              )}
            </Button>

            <input
              ref={bannerInputRef}
              hidden
              type="file"
              accept="image/*"
              onChange={handleBannerChange}
            />
          </div>
        </div>

        {/* Avatar */}
        <div className="flex items-center gap-6">
          <Avatar className="h-24 w-24 border">
            <AvatarImage src={avatar} />

            <AvatarFallback className="text-2xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="space-y-2">
            <Label>Profile Picture</Label>

            <Button
              type="button"
              variant="outline"
              disabled={uploadingAvatar}
              onClick={() => avatarInputRef.current?.click()}
            >
              {uploadingAvatar ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Camera className="mr-2 h-4 w-4" />
                  Change Picture
                </>
              )}
            </Button>

            <input
              ref={avatarInputRef}
              hidden
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
            />
          </div>
        </div>

        {/* Form starts here */}

        {/* Form */}
        <div className="grid gap-6 pt-2 md:grid-cols-2">
          {/* display_name */}
          <div className="space-y-2">
            <Label htmlFor="display_name">Display Name</Label>

            <Input
              id="display_name"
              placeholder="@johndoe"
              value={form.display_name}
              onChange={(e) =>
                setForm({
                  ...form,
                  display_name: e.target.value,
                })
              }
            />
          </div>

          {/* Professional Title */}
          <div className="space-y-2">
            <Label htmlFor="headline">Professional Title</Label>

            <Input
              id="headline"
              placeholder="Full Stack Developer"
              value={form.headline}
              onChange={(e) =>
                setForm({
                  ...form,
                  headline: e.target.value,
                })
              }
            />
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>

            <Input
              id="location"
              placeholder="Philippines"
              value={form.location}
              onChange={(e) =>
                setForm({
                  ...form,
                  location: e.target.value,
                })
              }
            />
          </div>

          {/* Hourly Rate */}
          <div className="space-y-2">
            <Label htmlFor="hourly_rate">Hourly Rate (USD)</Label>

            <Input
              id="hourly_rate"
              type="number"
              placeholder="25"
              value={form.hourly_rate}
              onChange={(e) =>
                setForm({
                  ...form,
                  hourly_rate: e.target.value,
                })
              }
            />
          </div>
        </div>

        {/* About */}
        <div className="space-y-2">
          <Label htmlFor="bio">About Me</Label>

          <Textarea
            id="bio"
            rows={8}
            placeholder="Tell clients about yourself..."
            value={form.bio}
            onChange={(e) =>
              setForm({
                ...form,
                bio: e.target.value,
              })
            }
          />
        </div>

        <DialogFooter className="pt-6">
          <Button
            variant="outline"
            onClick={() => {
              resetImages();
              onOpenChange(false);
            }}
            disabled={saving}
          >
            Cancel
          </Button>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
      {cropImage && (
        <ImageCropDialog
          open={cropOpen}
          image={cropImage}
          aspect={cropType === "avatar" ? 1 : 16 / 5}
          title={cropType === "avatar" ? "Crop Profile Picture" : "Crop Banner"}
          onClose={closeCropper}
          onCropComplete={handleCropComplete}
        />
      )}
    </Dialog>
  );
}
