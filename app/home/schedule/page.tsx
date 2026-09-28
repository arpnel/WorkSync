import ScheduleBoard from "@/components/schedule/ScheduleBoard";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";

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
      <WorkspacePageHeader
        title="Schedule"
        description="Organize your tasks, plan your week, and keep deadlines in view."
      />

      <ScheduleBoard
        key={[board, card, date].join(":")}
        initialBoardId={board}
        initialCardId={card}
        initialDate={date}
      />
    </div>
  );
}
