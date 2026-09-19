import { z } from "zod";
import type { ScheduleState, ScheduleBoard } from "@/types/schedule/schedule";
const schema = z.object({
  activeBoardId: z.string(),
  boards: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      lists: z.array(z.object({ id: z.string(), title: z.string() })),
      cards: z.array(
        z.object({
          id: z.string(),
          listId: z.string(),
          title: z.string(),
          description: z.string(),
          dueDate: z.string(),
          dueTime: z
            .string()
            .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/)
            .optional()
            .default(""),
          priority: z.enum(["low", "medium", "high"]),
        }),
      ),
    }),
  ),
});
export function createScheduleBoard(title: string): ScheduleBoard {
  return {
    id: crypto.randomUUID(),
    title,
    lists: ["To do", "In progress", "Done"].map((title) => ({
      id: crypto.randomUUID(),
      title,
    })),
    cards: [],
  };
}
export function loadSchedule(userId: string): ScheduleState {
  const raw = localStorage.getItem("worksync:schedule:v1:" + userId);
  if (raw) {
    const state = schema.parse(JSON.parse(raw));
    if (
      !state.boards.length ||
      !state.boards.some((b) => b.id === state.activeBoardId) ||
      state.boards.some((b) =>
        b.cards.some((c) => !b.lists.some((l) => l.id === c.listId)),
      )
    )
      throw new Error("Saved board data could not be read.");
    return state;
  }
  const board = createScheduleBoard("My schedule");
  return { boards: [board], activeBoardId: board.id };
}
export function saveSchedule(userId: string, state: ScheduleState) {
  localStorage.setItem("worksync:schedule:v1:" + userId, JSON.stringify(state));
  window.dispatchEvent(new Event("worksync:schedule-updated"));
}

export function parseSchedule(value: unknown): ScheduleState {
  const state = schema.parse(value);
  if (
    !state.boards.length ||
    !state.boards.some((b) => b.id === state.activeBoardId) ||
    state.boards.some((b) =>
      b.cards.some((c) => !b.lists.some((l) => l.id === c.listId)),
    )
  )
    throw new Error("Saved board data could not be read.");
  return state;
}
