"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { compareDeadlines, deadlineTime } from "./schedule-time";
import { cn } from "@/lib/utils";
import type { ScheduleCard } from "@/types/schedule/schedule";

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
const priorityStyles = {
  high: "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300",
  medium: "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300",
  low: "bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300",
};
const dots = { high: "bg-rose-400", medium: "bg-amber-400", low: "bg-sky-400" };
interface Props {
  cards: ScheduleCard[];
  initialDate?: string;
  status?: "ready" | "loading" | "unavailable";
  onOpen: (card: ScheduleCard) => void;
}
export default function ScheduleCalendar({
  cards,
  initialDate,
  onOpen,
  status = "ready",
}: Props) {
  const [selected, setSelected] = useState(
    () => initialDate ?? dateKey(new Date()),
  );
  const [month, setMonth] = useState(() => {
    const date = initialDate ? new Date(initialDate + "T00:00:00") : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const today = dateKey(new Date());
  const firstWeekday = month.getDay();
  const cellCount =
    Math.ceil(
      (firstWeekday +
        new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) /
        7,
    ) * 7;
  const agenda = cards
    .filter((card) => card.dueDate.startsWith(dateKey(month).slice(0, 7)))
    .sort(compareDeadlines);
  const selectedCards = cards
    .filter((card) => card.dueDate === selected)
    .sort(compareDeadlines);
  const undated = cards.filter((card) => !card.dueDate).length;
  function changeMonth(offset: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelected(dateKey(next));
  }
  const monthLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(month);
  return (
    <div className="@container min-w-0 space-y-6">
      <div className="grid overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm @min-[900px]:grid-cols-[minmax(0,1fr)_300px]">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 p-5 sm:px-7 sm:py-6 @min-[900px]:col-span-2">
          <div>
            <h2
              className="text-xl font-semibold tracking-tight sm:text-2xl"
              aria-live="polite"
            >
              {monthLabel}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {status === "ready"
                ? `${agenda.length} scheduled ${agenda.length === 1 ? "task" : "tasks"}`
                : status === "loading"
                  ? "Loading your schedule..."
                  : "Schedule unavailable"}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-xl border bg-background/60 p-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous month"
              onClick={() => changeMonth(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const now = new Date();
                setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                setSelected(dateKey(now));
              }}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next month"
              onClick={() => changeMonth(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </header>
        <section aria-label="Schedule calendar" className="min-w-0 p-3 sm:p-5">
          <div className="mb-2 grid grid-cols-7">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span
                key={day}
                className="py-3 text-center text-xs font-medium text-muted-foreground"
              >
                {day}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: cellCount }, (_, index) => {
              const date = new Date(
                month.getFullYear(),
                month.getMonth(),
                index - firstWeekday + 1,
              );
              const key = dateKey(date);
              const inMonth = date.getMonth() === month.getMonth();
              const due = cards
                .filter((card) => card.dueDate === key)
                .sort(compareDeadlines);
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`${new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(date)}: ${due.length} tasks due`}
                  aria-pressed={selected === key}
                  aria-current={key === today ? "date" : undefined}
                  onClick={() => {
                    setSelected(key);
                    if (!inMonth)
                      setMonth(
                        new Date(date.getFullYear(), date.getMonth(), 1),
                      );
                  }}
                  className={cn(
                    "relative flex min-h-16 min-w-0 flex-col items-center gap-1 rounded-xl p-1.5 text-left transition-colors focus-visible:z-10 sm:min-h-24 sm:items-start sm:p-2.5",
                    selected === key
                      ? "bg-primary/10 ring-1 ring-inset ring-primary/40"
                      : inMonth
                        ? "bg-card hover:bg-accent/50"
                        : "bg-muted/30 text-muted-foreground/40",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium sm:text-sm",
                      key === today && "bg-primary text-primary-foreground",
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <div className="hidden w-full space-y-1 sm:block">
                    {due.slice(0, 2).map((card) => (
                      <span
                        key={card.id}
                        className={cn(
                          "block truncate rounded px-1.5 py-1 text-[11px] font-medium",
                          priorityStyles[card.priority],
                        )}
                      >
                        {card.title}
                      </span>
                    ))}
                    {due.length > 2 && (
                      <span className="block px-1 text-[10px] text-muted-foreground">
                        +{due.length - 2} more
                      </span>
                    )}
                  </div>
                  <span className="flex gap-1 sm:hidden">
                    {due.slice(0, 3).map((card) => (
                      <span
                        key={card.id}
                        className={cn(
                          "size-1 rounded-full",
                          dots[card.priority],
                        )}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-2 pt-4 mt-4 text-xs text-muted-foreground">
            <span>Select a day to see its tasks</span>
            <div className="flex gap-3">
              {(["high", "medium", "low"] as const).map((priority) => (
                <span
                  key={priority}
                  className="flex items-center gap-1.5 capitalize"
                >
                  <span
                    className={cn("size-1.5 rounded-full", dots[priority])}
                  />
                  {priority}
                </span>
              ))}
            </div>
          </footer>
        </section>
        <aside
          aria-label="Selected day agenda"
          className="min-w-0 border-t border-border/60 bg-muted/30 @min-[900px]:border-l @min-[900px]:border-t-0"
        >
          <div className="px-6 pt-6 pb-4">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">
              Daily schedule
            </p>
            <h2 className="mt-2 text-lg font-semibold" aria-live="polite">
              {new Intl.DateTimeFormat("en", {
                weekday: "long",
                month: "short",
                day: "numeric",
              }).format(new Date(selected + "T00:00:00"))}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedCards.length} tasks scheduled
            </p>
          </div>
          <div className="space-y-3 px-5 pb-6">
            {status === "loading" ? (
              <div
                role="status"
                aria-label="Loading tasks"
                className="space-y-3"
              >
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
            ) : status === "unavailable" ? (
              <p className="p-3 text-sm text-muted-foreground">
                Tasks could not be loaded.
              </p>
            ) : selectedCards.length ? (
              selectedCards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onOpen(card)}
                  className="group w-full space-y-3 rounded-xl border border-border/50 bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:bg-accent/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "rounded-md px-2 py-1 text-[11px] font-medium capitalize",
                        priorityStyles[card.priority],
                      )}
                    >
                      {card.priority} priority
                    </span>
                    <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-primary" />
                  </div>
                  <p className="break-words text-sm font-medium leading-6">
                    {card.title}
                  </p>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5" />
                    {deadlineTime(card.dueTime)}
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 py-10 text-center">
                <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Coffee className="size-6" />
                </span>
                <h3 className="mt-4 text-sm font-semibold">
                  No tasks scheduled
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Nothing due on this day. Add a date to a task in Planner to
                  see it here.
                </p>
              </div>
            )}
          </div>
          {undated > 0 && (
            <p className="border-t bg-muted/30 px-5 py-4 text-xs leading-5 text-muted-foreground">
              {undated} undated tasks in Planner. Set due dates to include them
              in your calendar.
            </p>
          )}
        </aside>
      </div>
      <section
        aria-label="Deadline agenda"
        className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
      >
        <header className="flex items-center gap-3 border-b px-5 py-5 sm:px-6">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarDays className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">This month at a glance</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              All deadlines in {monthLabel}. Times are local.
            </p>
          </div>
        </header>
        {status === "loading" ? (
          <div
            role="status"
            aria-label="Loading deadlines"
            className="space-y-3 p-5"
          >
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : status === "unavailable" ? (
          <p className="p-6 text-sm text-muted-foreground">
            Deadlines are currently unavailable.
          </p>
        ) : agenda.length ? (
          <ul className="divide-y">
            {agenda.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => onOpen(card)}
                  className="group flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-accent/30 sm:px-6"
                >
                  <span className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-muted/60 py-2">
                    <span className="text-[10px] uppercase text-muted-foreground">
                      {new Intl.DateTimeFormat("en", { month: "short" }).format(
                        new Date(card.dueDate + "T00:00:00"),
                      )}
                    </span>
                    <span className="text-lg font-semibold">
                      {Number(card.dueDate.slice(8, 10))}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium">
                      {card.title}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {deadlineTime(card.dueTime)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-1 text-xs capitalize",
                      priorityStyles[card.priority],
                    )}
                  >
                    {card.priority}
                  </span>
                  <ArrowUpRight className="hidden size-4 text-muted-foreground sm:block" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium">No deadlines this month</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Give your planner tasks a due date to build your schedule.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
