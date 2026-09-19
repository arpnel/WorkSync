"use client";
import Link from "next/link";

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
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-[clamp(0.875rem,0.75rem+0.3vw,1rem)] text-muted-foreground">
            Your workspace at a glance. Keep track of work and plan what comes
            next.
          </p>
        </div>
      </header>
      <ActivityOverview
        charts={(activity) => <WorkAnalytics projectActivity={activity} />}
        tools={<DashboardTools />}
      />
    </div>
  );
}
