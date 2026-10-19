"use client";
import { useProjectSchedule } from "@/hooks/schedule/useProjectSchedule";
import { useManualDeadlines } from "@/hooks/schedule/useManualDeadlines";
import { useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
function dateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
export default function DashboardSchedule({ onNavigate }: { onNavigate?: () => void }) {
  const linked = useProjectSchedule();
  const manual = useManualDeadlines();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const entries = [
    ...linked.deadlines
      .filter((item) => item.kind !== "meeting" && item.stage !== "Done" && item.dueDate)
      .map((item) => ({
        id: item.id,
        projectKey: item.projectKey,
        title: item.title,
        projectTitle: item.projectTitle,
        dueDate: item.dueDate,
        href: "/home/schedule?" + new URLSearchParams({ date: item.dueDate }),
      })),
    ...manual.deadlines.map((item) => ({
      id: item.id,
      projectKey: "manual",
      title: item.title,
      projectTitle: "Personal deadline",
      dueDate: item.dueDate,
      href: "/home/schedule?" + new URLSearchParams({ date: item.dueDate }),
    })),
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const dates = new Set(entries.map((entry) => entry.dueDate));
  const selectedKey = selectedDate ? dateKey(selectedDate) : "";
  const today = dateKey(new Date());
  const upcoming = entries.filter((entry) => entry.dueDate >= today).slice(0, 5);
  const renderEntries = (items: typeof entries) => items.map((entry) => (
    <Link key={entry.projectKey + entry.id} href={entry.href} onClick={onNavigate} className="block rounded-lg px-2 py-2.5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">
      <p className="truncate text-[clamp(0.875rem,0.75rem+0.3vw,1rem)] font-medium">{entry.title}</p>
      <p className="mt-1 truncate text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] text-muted-foreground">{entry.projectTitle}</p>
      <p className="mt-1 text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] text-muted-foreground">{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(entry.dueDate + "T00:00:00"))}</p>
    </Link>
  ));
  return <>
    <section className="border-b pb-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[clamp(0.875rem,0.75rem+0.3vw,1rem)] font-semibold"><CalendarClock className="h-4 w-4" />Calendar</h2>
        <Link className="text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] font-medium text-primary" href={"/home/schedule" + (selectedKey ? "?date=" + selectedKey : "")} onClick={onNavigate}>Open calendar</Link>
      </div>
      <div className="mt-3 overflow-hidden">
        <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} modifiers={{ scheduled: (date) => dates.has(dateKey(date)) }} modifiersClassNames={{ scheduled: "ring-1 ring-inset ring-primary/50 font-semibold" }} className="mx-auto w-full bg-transparent p-0 [--cell-size:--spacing(8)]" />
      </div>
    </section>
    <section className="pt-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[clamp(0.875rem,0.75rem+0.3vw,1rem)] font-semibold">Upcoming deadlines</h2>
        <Link href="/home/schedule" onClick={onNavigate} className="text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] font-medium text-primary">View all</Link>
      </div>
      {linked.loading || manual.loading ? <Skeleton className="mt-3 h-24 w-full" /> : (
        <div className="mt-3 divide-y">
          {(linked.error || manual.error) && <p role="status" className="py-2 text-xs text-muted-foreground">{manual.error || "Project deadlines could not be loaded."}</p>}
          {upcoming.length ? renderEntries(upcoming) : <p className="py-2 text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] text-muted-foreground">Add a personal deadline or wait for an active project deadline.</p>}
        </div>
      )}
    </section>
  </>;
}