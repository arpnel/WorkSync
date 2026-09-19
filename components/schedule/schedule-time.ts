import type { ScheduleCard } from "@/types/schedule/schedule";
export function deadlineTime(time?: string) {
  if (!time) return "No time set";
  const [hour, minute] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hour, minute));
}
export function compareDeadlines(a: ScheduleCard, b: ScheduleCard) {
  return (
    a.dueDate.localeCompare(b.dueDate) ||
    (a.dueTime || "24:00").localeCompare(b.dueTime || "24:00") ||
    a.title.localeCompare(b.title)
  );
}
