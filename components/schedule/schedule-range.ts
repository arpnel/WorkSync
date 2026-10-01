import type { ScheduleCard } from "@/types/schedule/schedule";
export function isOnScheduleDate(card: ScheduleCard, date: string) {
  return card.startDate && card.dueDate && card.startDate <= card.dueDate
    ? card.startDate <= date && date <= card.dueDate
    : card.dueDate === date;
}
