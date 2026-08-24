"use client";

import { useState } from "react";

export type CropType = "avatar" | "banner";

export function useImageCrop() {
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropType, setCropType] = useState<CropType>("avatar");

  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [pendingBanner, setPendingBanner] = useState<File | null>(null);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  const openCropper = (
    file: File,
    type: CropType
  ) => {
    setCropType(type);
    setCropImage(URL.createObjectURL(file));
    setCropOpen(true);
  };

  const handleAvatarChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    openCropper(file, "avatar");

    e.target.value = "";
  };

  const handleBannerChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    openCropper(file, "banner");

    e.target.value = "";
  };

  const handleCropComplete = (file: File) => {
    if (cropType === "avatar") {
      setPendingAvatar(file);
      setAvatarPreview(URL.createObjectURL(file));
    } else {
      setPendingBanner(file);
      setBannerPreview(URL.createObjectURL(file));
    }

    closeCropper();
  };

  const closeCropper = () => {
    setCropOpen(false);
    setCropImage(null);
  };

  const resetImages = () => {
    setPendingAvatar(null);
    setPendingBanner(null);

    setAvatarPreview(null);
    setBannerPreview(null);
  };

  return {
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
  };
}