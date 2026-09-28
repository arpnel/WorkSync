"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";

import * as React from "react";
import { useParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProfileHeader from "@/components/profile/ProfileHeader";
import { PhoneDisclosure } from "@/components/shared/PhoneDisclosure";
import AboutSection from "@/components/profile/AboutSection";
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
    <main className="min-w-0">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <ProfileHeader profile={profile} isOwner={false} />
        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="min-w-0">
            <PhoneDisclosure title="About, skills & experience">
              <AboutSection profile={profile} />
            </PhoneDisclosure>
          </aside>
          <div className="min-w-0">
            {profile.role === "freelancer" ? (
              <Tabs defaultValue="reviews">
                <TabsList className="mb-5 h-auto w-full flex-wrap justify-start gap-1 rounded-lg border bg-card p-1.5">
                  <TabsTrigger value="reviews">Reviews</TabsTrigger>
                  <TabsTrigger value="services">Services</TabsTrigger>
                  <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
                </TabsList>
                <TabsContent value="services">
                  <ServicesSection userId={profile.user_id} isOwner={false} />
                </TabsContent>
                <TabsContent value="portfolio">
                  <PortfolioSection userId={profile.user_id} isOwner={false} />
                </TabsContent>
                <TabsContent value="reviews">
                  <ReviewsSection
                    userId={profile.user_id}
                    role={profile.role}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <ReviewsSection userId={profile.user_id} role={profile.role} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
