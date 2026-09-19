"use client";

import { useState } from "react";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import Link from "next/link";
import { SetupDocuments } from "@/components/profile/SetupDocuments";
import type { UpdateProfilePayload } from "@/types/profile/profile";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useProfile } from "../../../hooks/profile/useProfile";

import ProfileHeader from "../../../components/profile/ProfileHeader";
import OverviewSection from "../../../components/profile/OverviewSection";
import AboutSection from "../../../components/profile/AboutSection";
import ServicesSection from "../../../components/profile/ServicesSection";
import PortfolioSection from "../../../components/profile/PortfolioSection";
import ReviewsSection from "../../../components/profile/ReviewsSection";
import EditProfileDialog from "../../../components/profile/EditProfileDialog";

export default function ProfilePage() {
  const {
    profile,
    loading,
    error,
    updateProfile,
    updateAvatarImage,
    updateBannerImage,
  } = useProfile();

  const [editOpen, setEditOpen] = useState(false);

  const handleAvatarUpdate = async (file: File) => {
    return await updateAvatarImage(file);
  };

  const handleBannerUpdate = async (file: File) => {
    return await updateBannerImage(file);
  };

  const handleProfileUpdate = async (updates: UpdateProfilePayload) => {
    return await updateProfile(updates);
  };

  if (loading)
    return <ContentSkeleton label="Loading profile" variant="profile" />;

  if (!profile) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-2xl border p-10 text-center">
          <h2 className="text-2xl font-bold">Failed to load profile</h2>

          {error && (
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          )}
        </div>
      </div>
    );
  }

  const isFreelancer = profile.role === "freelancer";

  return (
    <main className="min-w-0">
      <div className="mx-auto max-w-6xl space-y-6 py-2">
        <ProfileHeader
          profile={profile}
          isOwner
          onEdit={() => setEditOpen(true)}
        />

        <AboutSection profile={profile} />
        <Link
          className="inline-block text-sm underline underline-offset-4"
          href={
            isFreelancer ? "/account-setup/freelancer" : "/account-setup/client"
          }
        >
          Edit account details
          {isFreelancer ? ", skills & supporting documents" : " & location"}
        </Link>

        {isFreelancer ? (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="mb-6 h-auto w-full flex-wrap justify-start rounded-none border-b bg-transparent p-0">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="services">Services</TabsTrigger>
              <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
              <TabsTrigger value="reviews">Reviews</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <OverviewSection profile={profile} />
              <div className="mt-6">
                <SetupDocuments userId={profile.user_id} />
              </div>
            </TabsContent>

            <TabsContent value="services">
              <ServicesSection userId={profile.user_id} />
            </TabsContent>

            <TabsContent value="portfolio">
              <PortfolioSection userId={profile.user_id} />
            </TabsContent>

            <TabsContent value="reviews">
              <ReviewsSection userId={profile.user_id} role={profile.role} />
            </TabsContent>
          </Tabs>
        ) : (
          <ReviewsSection userId={profile.user_id} role={profile.role} />
        )}

        <EditProfileDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          profile={profile}
          onSave={handleProfileUpdate}
          onAvatarUpdate={handleAvatarUpdate}
          onBannerUpdate={handleBannerUpdate}
        />
      </div>
    </main>
  );
}
