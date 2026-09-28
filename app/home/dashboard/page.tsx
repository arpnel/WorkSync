"use client";
import Link from "next/link";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";

import { ArrowUpRight, MessageCircle, Plus, Search } from "lucide-react";
import WorkAnalytics from "@/components/dashboard/WorkAnalytics";
import ActivityOverview from "@/components/dashboard/ActivityOverview";
import DashboardSchedule from "@/components/dashboard/DashboardSchedule";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function DashboardTools() {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent>
          <nav aria-label="Dashboard quick actions" className="space-y-1">
            {[
              {
                title: "Create a listing",
                description: "Share a service or opportunity",
                href: "/home/my-listings",
                Icon: Plus,
              },
              {
                title: "Browse marketplace",
                description: "Find your next collaboration",
                href: "/home/marketplace",
                Icon: Search,
              },
              {
                title: "Open messages",
                description: "Keep conversations moving",
                href: "/home/messages",
                Icon: MessageCircle,
              },
            ].map(({ title, description, href, Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 rounded-xl py-3 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {description}
                  </span>
                </span>
                <ArrowUpRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </nav>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <DashboardSchedule />
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="@container mx-auto w-full max-w-[1600px]">
      <div className="mb-6">
        <WorkspacePageHeader
          title="Dashboard"
          description="Your projects, performance, and upcoming work in one place."
          actions={
            <Link
              href="/home/my-listings"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              <Plus className="size-4" />
              Create a listing
            </Link>
          }
        />
      </div>

      <ActivityOverview
        charts={(activity) => <WorkAnalytics projectActivity={activity} />}
        tools={<DashboardTools />}
      />
    </div>
  );
}
