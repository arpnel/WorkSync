"use client";

import { useState } from "react";

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

  const handleProfileUpdate = async (updates: any) => {
    return await updateProfile(updates);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="animate-pulse space-y-6">
          <div className="h-80 rounded-2xl bg-muted" />
          <div className="h-72 rounded-2xl bg-muted" />
          <div className="h-96 rounded-2xl bg-muted" />
          <div className="h-96 rounded-2xl bg-muted" />
          <div className="h-96 rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

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
  <main className="min-h-screen bg-muted/30">
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <ProfileHeader
        profile={profile}
        isOwner
        onEdit={() => setEditOpen(true)}
      />

      <AboutSection profile={profile} />

      {isFreelancer ? (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-6 h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewSection profile={profile} />
          </TabsContent>

          <TabsContent value="services">
            <ServicesSection userId={profile.user_id} />
          </TabsContent>

          <TabsContent value="portfolio">
            <PortfolioSection userId={profile.user_id} />
          </TabsContent>

          <TabsContent value="reviews">
            <ReviewsSection userId={profile.user_id} />
          </TabsContent>
        </Tabs>
      ) : (
        <ReviewsSection userId={profile.user_id} />
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