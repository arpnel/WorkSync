export type SchedulePriority = "low" | "medium" | "high";
export interface ScheduleCard {
  id: string;
  listId: string;
  title: string;
  description: string;
  dueDate: string;
  dueTime?: string;
  priority: SchedulePriority;
}
export interface ScheduleList {
  id: string;
  title: string;
}
export interface ScheduleBoard {
  id: string;
  title: string;
  lists: ScheduleList[];
  cards: ScheduleCard[];
}
export interface ScheduleState {
  boards: ScheduleBoard[];
  activeBoardId: string;
}
export type ScheduleCardDraft = Omit<ScheduleCard, "id">;
