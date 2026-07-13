"use client";

import {
  Briefcase,
  FolderOpen,
  Star,
  CheckCircle,
  Wrench,
  RefreshCw,
  BadgeCheck,
  Award,
} from "lucide-react";

import type { Profile } from "../types/profile";

import { Card, CardContent } from "@/components/ui/card";

interface OverviewSectionProps {
  profile: Profile;
}

export default function OverviewSection({
  profile,
}: OverviewSectionProps) {
  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-2xl">
          <CardContent className="flex items-center gap-4 p-6">
            <Briefcase className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Services</p>
              <p className="text-2xl font-bold">0</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="flex items-center gap-4 p-6">
            <FolderOpen className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">
                Portfolio Projects
              </p>
              <p className="text-2xl font-bold">0</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="flex items-center gap-4 p-6">
            <Star className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">
                Average Rating
              </p>
              <p className="text-2xl font-bold">0.0</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="flex items-center gap-4 p-6">
            <CheckCircle className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">
                Completed Jobs
              </p>
              <p className="text-2xl font-bold">0</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Professional Highlights */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardContent className="space-y-4 p-6">
            <h3 className="text-lg font-semibold">
              Professional Highlights
            </h3>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <BadgeCheck className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">
                    Projects Continued
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Successfully completed unfinished projects
                    started by other freelancers.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">
                    Revision Requests Accepted
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Shows willingness to refine work based on
                    client feedback.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Award className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">
                    Client Satisfaction
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Based on completed projects and ratings.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Skills */}
        <Card className="rounded-2xl">
          <CardContent className="space-y-4 p-6">
            <h3 className="text-lg font-semibold">
              Top Skills
            </h3>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm">
                UI Design
              </span>

              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm">
                React
              </span>

              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm">
                Next.js
              </span>

              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm">
                TypeScript
              </span>

              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm">
                Tailwind CSS
              </span>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Wrench className="h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">
                Skills will be populated from the freelancer's
                profile.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}