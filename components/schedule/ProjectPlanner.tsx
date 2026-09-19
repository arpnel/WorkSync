"use client";
import Link from "next/link";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import type { LinkedDeadline } from "@/lib/projectSchedule";
const colors = {
  high: "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300",
  medium: "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300",
  low: "bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300",
};
export default function ProjectPlanner({
  cards,
  search,
  priority,
}: {
  cards: LinkedDeadline[];
  search: string;
  priority: string;
}) {
  const tasks = cards.filter((card) => card.kind !== "meeting");
  if (!tasks.length) return null;
  const groups = [...new Set(tasks.map((card) => card.projectKey))];
  return (
    <section className="space-y-4" aria-label="Agreed project plans">
      <div>
        <h2 className="text-lg font-semibold">Your project plans</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Added after both participants sign. Dates and progress follow the
          project. High: due within 2 days or overdue; medium: within 7 days.
        </p>
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {groups.map((key) => {
          const all = tasks.filter((card) => card.projectKey === key);
          const visible = all.filter(
            (card) =>
              (priority === "all" || card.priority === priority) &&
              (!search ||
                `${card.title} ${card.projectTitle} ${card.description}`
                  .toLowerCase()
                  .includes(search)),
          );
          if (!visible.length) return null;
          return (
            <section
              key={key}
              className="min-w-0 rounded-2xl border bg-muted/40 p-3"
            >
              <header className="mb-3 flex items-center justify-between gap-3 px-1">
                <h3 className="break-words text-sm font-semibold">
                  {all[0].projectTitle}
                </h3>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {all.filter((c) => c.stage === "Done").length}/{all.length}{" "}
                  done
                </span>
              </header>
              <div className="space-y-3">
                {visible.map((card) => (
                  <Link
                    key={card.id}
                    href={card.href}
                    className="block space-y-3 rounded-xl border bg-card p-4 shadow-sm transition hover:border-primary/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-md px-2 py-1 text-xs capitalize ${colors[card.priority]}`}
                      >
                        {card.stage === "Done"
                          ? "Completed"
                          : `${card.priority} priority`}
                      </span>
                      <ArrowUpRight className="size-4 text-muted-foreground" />
                    </div>
                    <p className="break-words text-sm font-medium">
                      {card.title}
                    </p>
                    {card.description && (
                      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {card.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" />
                        {card.dueDate
                          ? new Date(
                              card.dueDate + "T00:00:00",
                            ).toLocaleDateString()
                          : "Date not agreed"}
                      </span>
                      <span>{card.stage}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
