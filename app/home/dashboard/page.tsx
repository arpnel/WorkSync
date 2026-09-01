"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  MessageCircle,
  Menu,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import AppBarChart from "@/components/ui/AppBarChart";
import { TableFooterExample } from "@/components/dashboard/tablesam";

const stats = [
  {
    label: "Active projects",
    value: "25",
    detail: "4 awaiting review",
    icon: BriefcaseBusiness,
    iconClass: "bg-blue-50 text-blue-700",
  },
  {
    label: "Upcoming deadlines",
    value: "10",
    detail: "2 due this week",
    icon: CalendarClock,
    iconClass: "bg-amber-50 text-amber-700",
  },
  {
    label: "Active clients",
    value: "10",
    detail: "3 new this month",
    icon: Users,
    iconClass: "bg-violet-50 text-violet-700",
  },
  {
    label: "Completed",
    value: "24",
    detail: "92% completion rate",
    icon: CheckCircle2,
    iconClass: "bg-emerald-50 text-emerald-700",
  },
];

const schedule = [
  {
    date: "12",
    month: "SEP",
    title: "Dashboard prototype review",
    time: "10:00 AM",
  },
  {
    date: "14",
    month: "SEP",
    title: "Animation milestone delivery",
    time: "2:30 PM",
  },
  {
    date: "18",
    month: "SEP",
    title: "Client progress call",
    time: "4:00 PM",
  },
];

const activity = [
  {
    title: "Logo Design completed",
    detail: "Project marked as complete",
    icon: CheckCircle2,
  },
  {
    title: "Payment received",
    detail: "PHP 18,500 added to earnings",
    icon: CircleDollarSign,
  },
  {
    title: "New project message",
    detail: "Data Visualization Dashboard",
    icon: MessageCircle,
  },
];

function DashboardTools({
  selectedDate,
  onSelectDate,
  onNavigate,
}: {
  selectedDate: Date | undefined;
  onSelectDate: (date: Date | undefined) => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="p-4">
      <section className="border-b pb-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4" />
          Calendar
        </h2>
        <div className="mt-3 overflow-hidden">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={onSelectDate}
            className="mx-auto w-full bg-transparent p-0 [--cell-size:--spacing(8)]"
          />
        </div>
      </section>

      <section className="border-b py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Upcoming schedule</h2>
          <Link
            href="/home/schedule"
            onClick={onNavigate}
            className="text-xs font-medium text-primary"
          >
            View all
          </Link>
        </div>
        <div className="mt-3 divide-y">
          {schedule.map((item) => (
            <div key={`${item.month}-${item.date}`} className="flex gap-3 py-3">
              <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md border bg-background">
                <span className="text-[9px] font-medium text-muted-foreground">
                  {item.month}
                </span>
                <span className="text-sm font-semibold">{item.date}</span>
              </div>
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium">{item.title}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" />
                  {item.time}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b py-5">
        <h2 className="text-sm font-semibold">Quick actions</h2>
        <nav className="mt-2 grid gap-1">
          <Link
            href="/home/my-listings"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-2 py-2.5 text-sm transition hover:bg-muted"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            Create a listing
          </Link>
          <Link
            href="/home/marketplace"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-2 py-2.5 text-sm transition hover:bg-muted"
          >
            <Search className="h-4 w-4 text-muted-foreground" />
            Browse marketplace
          </Link>
          <Link
            href="/home/messages"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-2 py-2.5 text-sm transition hover:bg-muted"
          >
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            Open messages
          </Link>
        </nav>
      </section>

      <section className="pt-5">
        <h2 className="text-sm font-semibold">Recent activity</h2>
        <div className="mt-3 divide-y">
          {activity.map((item) => (
            <div key={item.title} className="flex gap-3 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <item.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {item.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(),
  );

  return (
    <div className="mx-auto w-full max-w-[1800px]">
      <div className="mb-3 flex justify-end xl:hidden">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-md border bg-background transition hover:bg-muted"
          onClick={() => setToolsOpen((current) => !current)}
          aria-expanded={toolsOpen}
          aria-controls="dashboard-tools-sidebar"
          aria-label={
            toolsOpen ? "Close dashboard tools" : "Open dashboard tools"
          }
          title={toolsOpen ? "Close dashboard tools" : "Open dashboard tools"}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div
        className={`grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start ${
          toolsOpen ? "lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start" : ""
        }`}
      >
        <div className="min-w-0 space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label} className="gap-0 py-0">
                <CardContent className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{stat.value}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {stat.detail}
                    </p>
                  </div>
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${stat.iconClass}`}
                  >
                    <stat.icon className="h-4 w-4" />
                  </span>
                </CardContent>
              </Card>
            ))}
          </section>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Earnings overview</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Monthly project earnings
                </p>
              </div>
              <Badge variant="outline">Last 6 months</Badge>
            </CardHeader>
            <CardContent className="min-w-0">
              <AppBarChart />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Top paid projects</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Highest-value completed and active work
                </p>
              </div>
              <Link
                href="/home/projects"
                className="flex items-center gap-1 text-xs font-medium text-primary"
              >
                View projects
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="min-w-0 overflow-x-auto">
              <TableFooterExample />
            </CardContent>
          </Card>
        </div>

        <aside
          id="dashboard-tools-sidebar"
          className={`${
            toolsOpen ? "order-first block lg:order-none" : "hidden"
          } w-full self-stretch border bg-muted/20 xl:sticky xl:top-4 xl:order-none xl:block xl:min-h-[calc(100vh-7rem)] xl:justify-self-end`}
        >
          <DashboardTools
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </aside>
      </div>
    </div>
  );
}
