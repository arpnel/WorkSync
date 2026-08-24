"use client";

import { CalendarDays, DollarSign, MapPin } from "lucide-react";

import type { Profile } from "../../types/profile/profile";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AboutSectionProps {
  profile: Profile;
}

export default function AboutSection({ profile }: AboutSectionProps) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">About</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <p className="whitespace-pre-wrap leading-7 text-muted-foreground">
          {profile.bio || "Tell clients about yourself and your experience."}
        </p>

        <div className="border-t" />

        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Location</p>
              <p className="font-medium">
                {profile.location || "Not specified"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Hourly Rate</p>
              <p className="font-medium">
                {profile.hourly_rate
                  ? `$${profile.hourly_rate}/hr`
                  : "Not specified"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Member Since</p>
              <p className="font-medium">
                {new Date(profile.created_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                })}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
