"use client";
import { useProjectSchedule } from "@/hooks/schedule/useProjectSchedule";
import { useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { useSchedule } from "@/hooks/schedule/useSchedule";
function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export default function DashboardSchedule({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const { state, loading, error } = useSchedule();
  const linked = useProjectSchedule();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(),
  );
  const personal = (state?.boards ?? [])
    .flatMap((board) =>
      board.cards
        .filter((card) => card.dueDate)
        .map((card) => ({
          ...card,
          boardId: board.id,
          boardTitle: board.title,
        })),
    )
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title),
    );
  const entries = [
    ...personal.map((entry) => ({
      ...entry,
      href:
        "/home/schedule?" +
        new URLSearchParams({
          board: entry.boardId,
          date: entry.dueDate,
          card: entry.id,
        }),
    })),
    ...linked.deadlines
      .filter((card) => card.stage !== "Done" && card.dueDate)
      .map((card) => ({
        ...card,
        boardId: card.projectKey,
        boardTitle: card.projectTitle,
      })),
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const dates = new Set(entries.map((entry) => entry.dueDate));
  const selectedKey = selectedDate ? dateKey(selectedDate) : "";
  const today = dateKey(new Date());
  const upcoming = entries
    .filter((entry) => entry.dueDate >= today)
    .slice(0, 5);
  const renderEntries = (items: typeof entries) =>
    items.map((entry) => (
      <Link
        key={entry.boardId + entry.id}
        href={entry.href}
        onClick={onNavigate}
        className="block rounded-lg px-2 py-2.5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
      >
        <p className="truncate text-[clamp(0.875rem,0.75rem+0.3vw,1rem)] font-medium">
          {entry.title}
        </p>
        <p className="mt-1 truncate text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] text-muted-foreground">
          {entry.boardTitle}
        </p>
        <p className="mt-1 text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] text-muted-foreground">
          {new Intl.DateTimeFormat("en", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }).format(new Date(entry.dueDate + "T00:00:00"))}
        </p>
      </Link>
    ));
  return (
    <>
      <section className="border-b pb-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[clamp(0.875rem,0.75rem+0.3vw,1rem)] font-semibold">
            <CalendarClock className="h-4 w-4" />
            Calendar
          </h2>
          <Link
            className="text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] font-medium text-primary"
            href={
              "/home/schedule" + (selectedKey ? "?date=" + selectedKey : "")
            }
            onClick={onNavigate}
          >
            Open planner
          </Link>
        </div>
        <div className="mt-3 overflow-hidden">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            modifiers={{ scheduled: (date) => dates.has(dateKey(date)) }}
            modifiersClassNames={{
              scheduled: "ring-1 ring-inset ring-primary/50 font-semibold",
            }}
            className="mx-auto w-full bg-transparent p-0 [--cell-size:--spacing(8)]"
          />
        </div>
      </section>
      <section className="pt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[clamp(0.875rem,0.75rem+0.3vw,1rem)] font-semibold">
            Upcoming schedule
          </h2>
          <Link
            href="/home/schedule"
            onClick={onNavigate}
            className="text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] font-medium text-primary"
          >
            View all
          </Link>
        </div>
        {loading || linked.loading ? (
          <Skeleton className="mt-3 h-24 w-full" />
        ) : error ? (
          <p className="mt-3 text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] text-muted-foreground">
            Schedule unavailable.
          </p>
        ) : (
          <div className="mt-3 divide-y">
            {linked.error && (
              <p role="status" className="py-2 text-xs text-muted-foreground">
                {linked.error}
              </p>
            )}
            {upcoming.length ? (
              renderEntries(upcoming)
            ) : (
              <p className="py-2 text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] text-muted-foreground">
                Add due dates to planner cards to see them here.
              </p>
            )}
          </div>
        )}
      </section>
    </>
  );
}
