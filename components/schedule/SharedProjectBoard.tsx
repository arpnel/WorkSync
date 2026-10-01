"use client";
import Link from "next/link";
import type { ScheduleBoard } from "@/types/schedule/schedule";
import type { LinkedDeadline } from "@/lib/projectSchedule";

const dateLabel = (value?: string) =>
  value
    ? new Date(value + "T00:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not set";

export default function SharedProjectBoard({
  board,
}: {
  board: ScheduleBoard;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Shared project progress for the client and freelancer. Update work in
        the project workspace. Milestone ranges begin at the project start;
        separate milestone start dates are not recorded.
      </p>
      <div
        aria-label={board.title + " board"}
        className="grid gap-4 rounded-xl bg-muted/40 p-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {board.lists.map((list) => {
          const cards = board.cards.filter(
            (card) => card.listId === list.id,
          ) as LinkedDeadline[];
          return (
            <section
              key={list.id}
              className="min-w-0 rounded-xl border bg-background/60 p-3"
            >
              <h3 className="mb-3 flex justify-between text-sm font-semibold">
                {list.title}
                <span className="text-muted-foreground">{cards.length}</span>
              </h3>
              <div className="space-y-3">
                {cards.map((card) => (
                  <Link
                    key={card.id}
                    href={card.href}
                    className="block space-y-3 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <p className="text-xs capitalize text-muted-foreground">
                      {card.kind}
                    </p>
                    <h4 className="font-medium">{card.title}</h4>
                    {card.description && (
                      <p className="line-clamp-3 text-sm text-muted-foreground">
                        {card.description}
                      </p>
                    )}
                    <dl className="space-y-1 border-t pt-3 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt>
                          {card.kind === "milestone"
                            ? "Project start"
                            : "Start"}
                        </dt>
                        <dd>{dateLabel(card.startDate)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Deadline</dt>
                        <dd>{dateLabel(card.dueDate)}</dd>
                      </div>
                    </dl>
                    <p className="text-xs font-medium text-primary">
                      Open project →
                    </p>
                  </Link>
                ))}
              </div>
              {!cards.length && (
                <p className="py-5 text-center text-xs text-muted-foreground">
                  No work in this stage
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
