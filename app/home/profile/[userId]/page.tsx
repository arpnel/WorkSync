"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";

import * as React from "react";
import { useParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProfileHeader from "@/components/profile/ProfileHeader";
import AboutSection from "@/components/profile/AboutSection";
import OverviewSection from "@/components/profile/OverviewSection";
import ServicesSection from "@/components/profile/ServicesSection";
import PortfolioSection from "@/components/profile/PortfolioSection";
import ReviewsSection from "@/components/profile/ReviewsSection";
import { getPublicProfile } from "@/services/profile/profileservice";
import type { Profile } from "@/types/profile/profile";

export default function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    void getPublicProfile(userId)
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch((value) => {
        if (active)
          setError(
            value instanceof Error ? value.message : "Failed to load profile.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);
  if (loading)
    return <ContentSkeleton label="Loading profile" variant="profile" />;
  if (!profile)
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        {error || "Profile not found."}
      </div>
    );
  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <ProfileHeader profile={profile} isOwner={false} />
        <AboutSection profile={profile} />
        {profile.role === "freelancer" ? (
          <Tabs defaultValue="overview">
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
              <ServicesSection userId={profile.user_id} isOwner={false} />
            </TabsContent>
            <TabsContent value="portfolio">
              <PortfolioSection userId={profile.user_id} isOwner={false} />
            </TabsContent>
            <TabsContent value="reviews">
              <ReviewsSection userId={profile.user_id} role={profile.role} />
            </TabsContent>
          </Tabs>
        ) : (
          <ReviewsSection userId={profile.user_id} role={profile.role} />
        )}
      </div>
    </main>
  );
}
