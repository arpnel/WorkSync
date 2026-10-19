import { z } from "zod";
import type { SchedulePriority } from "@/types/schedule/schedule";

export interface ManualDeadline {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  dueTime: string;
  priority: SchedulePriority;
}

const deadlineSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  description: z.string().max(1000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueTime: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/),
  priority: z.enum(["low", "medium", "high"]),
});
const listSchema = z.array(deadlineSchema).refine((deadlines) => deadlines.every(({ dueDate }) => {
  const date = new Date(dueDate + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dueDate;
}));
export const manualDeadlineStorageKey = (userId: string) =>
  "worksync:deadlines:v1:" + userId;

export function readManualDeadlines(userId: string): ManualDeadline[] {
  const raw = localStorage.getItem(manualDeadlineStorageKey(userId));
  if (!raw) return [];
  return listSchema.parse(JSON.parse(raw));
}

export function writeManualDeadlines(userId: string, deadlines: ManualDeadline[]) {
  localStorage.setItem(manualDeadlineStorageKey(userId), JSON.stringify(deadlines));
}