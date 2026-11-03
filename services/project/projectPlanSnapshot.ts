import { z } from "zod";

const planTaskSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(1000),
  priority: z.enum(["low", "medium", "high"]),
  expectedDays: z.number().int().min(1).max(3650).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  milestoneId: z.string().min(1).max(80).nullable().optional(),
});

const planColumnSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  type: z.enum(["stage", "done"]),
  tasks: z.array(planTaskSchema).max(25),
  pinned: z.boolean().optional(),
});

export const projectPlanSnapshotSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    // Keep this in sync with the reusable plan editor's 2,000 character limit.
    description: z.string().max(2000),
    content: z.object({
      columns: z.array(planColumnSchema).min(1).max(20),
    }),
  })
  .superRefine((plan, context) => {
    const columns = plan.content.columns;
    const doneIndexes = columns.flatMap((column, index) =>
      column.type === "done" ? [index] : [],
    );
    if (doneIndexes.length > 1) {
      context.addIssue({
        code: "custom",
        path: ["content", "columns"],
        message: "A project plan can contain only one Done stage.",
      });
    } else if (doneIndexes.length === 1 && doneIndexes[0] !== columns.length - 1) {
      context.addIssue({
        code: "custom",
        path: ["content", "columns", doneIndexes[0], "type"],
        message: "The Done stage must be final.",
      });
    }
    const taskCount = columns.reduce(
      (total, column) => total + column.tasks.length,
      0,
    );
    if (taskCount > 120) {
      context.addIssue({
        code: "custom",
        path: ["content", "columns"],
        message: "A project plan can contain at most 120 tasks.",
      });
    }
  });

export type ProjectPlanSnapshotData = z.infer<typeof projectPlanSnapshotSchema>;
