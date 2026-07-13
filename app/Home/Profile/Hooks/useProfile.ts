"use client";

import { useEffect, useState } from "react";

import type {
  Profile,
  UpdateProfilePayload,
} from "../types/profile";

import {
  getCurrentProfile,
  updateProfile,
  uploadAvatar,
  uploadBanner,
} from "../Services/profileservice";

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getCurrentProfile();

      if (!data) {
        throw new Error("Profile not found.");
      }

      setProfile(data);
    } catch (err: any) {
      console.error("Failed to load profile:", err);

      setProfile(null);
      setError(err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const saveProfile = async (
    updates: UpdateProfilePayload
  ) => {
    if (!profile) return false;

    try {
      const updatedProfile = await updateProfile(
        profile.user_id,
        updates
      );

      setProfile(updatedProfile);

      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const updateAvatarImage = async (
    file: File
  ) => {
    if (!profile) return false;

    try {
      const avatarUrl = await uploadAvatar(
        profile.user_id,
        file
      );

      setProfile({
        ...profile,
        avatar_url: avatarUrl,
      });

      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const updateBannerImage = async (
    file: File
  ) => {
    if (!profile) return false;

    try {
      const bannerUrl = await uploadBanner(
        profile.user_id,
        file
      );

      setProfile({
        ...profile,
        banner_url: bannerUrl,
      });

      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  return {
    profile,
    loading,
    error,
    refreshProfile: loadProfile,
    updateProfile: saveProfile,
    updateAvatarImage,
    updateBannerImage,
  };
}