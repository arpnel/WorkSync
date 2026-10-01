import { z } from "zod";

const time = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();
const option = z.object({ id: z.string().uuid(), text: z.string() });
const question = z.object({
  id: z.string().uuid(),
  prompt: z.string(),
  type: z.enum(["single", "multiple", "boolean"]),
  points: z.number().positive(),
  options: z.array(option),
});
const quiz = z.object({
  title: z.string(),
  instructions: z.string(),
  passingPercentage: z.number().min(1).max(100),
  timeLimitMinutes: z.number().positive().nullable(),
  questions: z.array(question),
});
const draftQuiz = quiz.extend({
  questions: z.array(
    question.extend({
      correctOptionIds: z.array(z.string().uuid()),
      skillIds: z.array(z.string().uuid()),
    }),
  ),
});
const result = z.object({
  status: z.enum(["started", "submitted", "expired"]),
  score: count.nullable(),
  total: count.nullable(),
  percentage: z.number().min(0).max(100).nullable(),
  passed: z.boolean().nullable(),
  submittedAt: time.nullable(),
  deadlineAt: time.optional(),
  startedAt: time.optional(),
});
const opening = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  openedAt: time,
  opensAt: time,
  closesAt: time,
  closedAt: time.nullable(),
  status: z.enum(["open", "scheduled", "closed"]),
});
export const adminListSchema = z.array(
  z.object({
    categoryId: z.string().uuid(),
    category: z.string(),
    assessmentId: z.string().uuid().nullable(),
    version: z.number().int().positive().nullable(),
    quiz: draftQuiz.nullable(),
    openings: z.array(opening),
  }),
);
export const memberListSchema = z.array(
  opening.extend({
    category: z.string(),
    title: z.string(),
    instructions: z.string(),
    questionCount: count,
    passingPercentage: z.number(),
    timeLimitMinutes: z.number().nullable(),
    attempt: result.nullable(),
  }),
);
export const evidenceSchema = z.array(
  z.object({
    category_id: z.string().uuid(),
    category: z.string(),
    version: z.number().int().positive(),
    percentage: z.number().min(0).max(100),
    passed: z.literal(true),
    completed_at: time,
  }),
);
export const resultsSchema = z.object({
  openingId: z.string().uuid(),
  category: z.string(),
  openedAt: time,
  closesAt: time,
  closedAt: time.nullable(),
  rows: z.array(
    z.object({
      userId: z.string().uuid(),
      name: z.string(),
      status: z.enum(["not_started", "started", "expired", "submitted"]),
      startedAt: time.nullable(),
      submittedAt: time.nullable(),
      percentage: z.number().nullable(),
      passed: z.boolean().nullable(),
    }),
  ),
});
export const attemptSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("started"),
    deadlineAt: time.optional(),
    serverNow: time,
    quiz: quiz.optional(),
    answers: z.record(z.array(z.string().uuid())).optional(),
  }),
  z.object({ status: z.literal("expired") }),
  result.extend({
    status: z.literal("submitted"),
    score: count,
    total: count.positive(),
    percentage: z.number().min(0).max(100),
    passed: z.boolean(),
    submittedAt: time,
  }),
]);
export function parseAssessment<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new Error(
      "Assessment service returned an incompatible response. Check the skill assessment migration.",
    );
  return parsed.data;
}
