import { z } from "zod";

const planTaskSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(1000),
  priority: z.enum(["low", "medium", "high"]),
  expectedDays: z.number().int().min(1).max(3650).optional(),
});

const planColumnSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  type: z.literal("stage"),
  tasks: z.array(planTaskSchema).max(25),
  pinned: z.boolean().optional(),
});

export const projectPlanSnapshotSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(1500),
    content: z.object({
      columns: z.array(planColumnSchema).min(1).max(20),
    }),
  })
  .superRefine((plan, context) => {
    const columns = plan.content.columns;
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
