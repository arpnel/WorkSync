"use client";

import { Camera, Pencil, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Profile } from "../../types/profile/profile";

interface ProfileHeaderProps {
  profile: Profile;
  googleAvatar?: string | null;
  isOwner?: boolean;

  onEdit?: () => void;

  onAvatarUpdate?: (file: File) => Promise<boolean>;
  onBannerUpdate?: (file: File) => Promise<boolean>;
}

export default function ProfileHeader({
  profile,
  googleAvatar,
  isOwner = true,
  onEdit,
}: ProfileHeaderProps) {
  const avatar = profile.avatar_url || googleAvatar || undefined;

  const displayName =
    profile.display_name || `${profile.first_name} ${profile.last_name}`;

  const initials = displayName
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Card className="overflow-hidden rounded-2xl border shadow-sm">
      {/* Banner */}
      <div className="relative h-44 w-full overflow-hidden sm:h-[260px] md:h-52 lg:h-[320px]">
        {profile.banner_url ? (
          <img
            src={profile.banner_url}
            alt="Banner"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-600" />
        )}

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/30" />

        {isOwner && (
          <Button
            size="icon"
            variant="secondary"
            className="absolute right-5 top-5 z-10 rounded-full shadow-lg backdrop-blur"
          >
            <Camera className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Profile */}
      <div className="px-6 pb-6 pt-0 sm:px-8 sm:pb-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          {/* Left */}
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
            <Avatar className="-mt-20 h-25 w-25 border-4 border-background shadow-xl">
              <AvatarImage src={avatar} />
              <AvatarFallback className="text-5xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="pb-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                {displayName}
              </h1>

              {profile.headline && (
                <p className="mt-1 text-muted-foreground">{profile.headline}</p>
              )}

              {profile.rating !== null && (
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />

                  <span className="font-medium text-foreground">
                    {profile.rating.toFixed(1)}
                  </span>

                  <span>({profile.reviews_count} reviews)</span>
                </div>
              )}
            </div>
          </div>

          {/* Right */}
          {isOwner && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit Profile
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
