import ScheduleBoard from "@/components/schedule/ScheduleBoard";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const board = typeof params.board === "string" ? params.board : undefined;
  const card = typeof params.card === "string" ? params.card : undefined;
  const rawDate = typeof params.date === "string" ? params.date : "";
  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(rawDate) &&
    !Number.isNaN(new Date(rawDate + "T00:00:00").getTime())
      ? rawDate
      : undefined;
  return (
    <div className="min-w-0 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Schedule
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Plan your work, organize tasks, and stay on top of deadlines.
        </p>
      </header>
      <ScheduleBoard
        key={[board, card, date].join(":")}
        initialBoardId={board}
        initialCardId={card}
        initialDate={date}
      />
    </div>
  );
}
