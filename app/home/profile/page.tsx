"use client";

import { ProfileListings } from "@/components/profile/ProfileListings";
import { useState } from "react";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { SetupDocuments } from "@/components/profile/SetupDocuments";
import type { UpdateProfilePayload } from "@/types/profile/profile";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useProfile } from "../../../hooks/profile/useProfile";

import ProfileHeader from "../../../components/profile/ProfileHeader";
import { PhoneDisclosure } from "@/components/shared/PhoneDisclosure";
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
      <div className="mx-auto max-w-[1440px] space-y-6 py-2">
        <ProfileHeader
          profile={profile}
          isOwner
          onEdit={() => {
            setEditOpen(true);
          }}
        />

        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="min-w-0">
            <PhoneDisclosure title="About, skills & experience">
              <AboutSection profile={profile} />
            </PhoneDisclosure>
            {isFreelancer && (
              <details className="mt-4 rounded-xl border bg-card p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  My documents
                </summary>
                <div className="mt-4">
                  <SetupDocuments userId={profile.user_id} editable />
                </div>
              </details>
            )}
          </aside>
          <div className="min-w-0">
            {isFreelancer ? (
              <Tabs defaultValue="reviews" className="w-full">
                <TabsList className="mb-5 h-auto w-full flex-wrap justify-start gap-1 rounded-lg border bg-card p-1.5">
                  <TabsTrigger value="reviews">Reviews</TabsTrigger>
                  <TabsTrigger value="services">Services</TabsTrigger>
                  <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
                </TabsList>

                <TabsContent value="services">
                  <ServicesSection userId={profile.user_id} editable />
                </TabsContent>

                <TabsContent value="portfolio">
                  <PortfolioSection userId={profile.user_id} editable />
                </TabsContent>

                <TabsContent value="reviews">
                  <ReviewsSection
                    userId={profile.user_id}
                    role={profile.role}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <>
                <ProfileListings editable />
                <ReviewsSection userId={profile.user_id} role={profile.role} />
              </>
            )}
          </div>
        </div>
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
