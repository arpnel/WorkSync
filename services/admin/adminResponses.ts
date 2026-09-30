import { z } from "zod";

const count = z.number().finite().int().nonnegative();
const recordsSchema = z.object({
  rows: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      detail: z.string(),
      created_at: z
        .string()
        .nullable()
        .transform((value) => value ?? ""),
      owner_id: z
        .string()
        .nullish()
        .transform((value) => value ?? undefined),
      document_paths: z
        .array(z.string())
        .nullish()
        .transform((value) => value ?? undefined),
    }),
  ),
  total: count,
  stats: z.record(count).optional(),
});
const analyticsSchema = z.object({
  counts: z.record(count),
  completion_rate: z.number().finite().nullable(),
  average_project_value: z.number().finite().nullable(),
  average_rating: z.number().finite().nullable(),
  categories: z.array(
    z.object({ name: z.string(), jobs: count, services: count }),
  ),
  activity: z.array(
    z.object({ month: z.string(), users: count, projects: count }),
  ),
});
export type AdminAnalyticsResult = z.infer<typeof analyticsSchema>;
const disputeContextSchema = z.object({
  project: z.object({ title: z.string(), status: z.string() }),
  contract: z
    .object({
      final_price: z.number().finite(),
      delivery_time_days: count,
      revisions_count: count,
      terms: z.string().nullable(),
      status: z.string(),
    })
    .nullable(),
  dispute: z.object({
    evidence_path: z.string().nullable(),
    resolution: z.string().nullable(),
  }),
  parties: z.array(
    z.object({
      role: z.string(),
      display_name: z.string().nullable(),
      user_id: z.string(),
    }),
  ),
  milestones: z.array(
    z.object({
      milestone_id: z.string(),
      title: z.string(),
      status: z.string(),
    }),
  ),
  submissions: z.array(
    z.object({
      submission_id: z.string(),
      kind: z.string(),
      status: z.string(),
      created_at: z.string(),
      body: z.string().nullable(),
      link: z.string().nullable(),
      attachment_path: z.string().nullable(),
      attachment_name: z.string().nullable(),
    }),
  ),
  revisions: z.array(
    z.object({
      revision_id: z.string(),
      status: z.string(),
      instructions: z.string(),
    }),
  ),
  messages: z.array(
    z.object({
      message_id: z.string(),
      sender_id: z.string(),
      message: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
});
export type AdminDisputeContext = z.infer<typeof disputeContextSchema>;
function parseResponse<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
  rpc: string,
): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new Error(
      `Unable to load admin data: ${rpc} returned an incompatible response. Check the deployed function's response contract.`,
    );
  return result.data;
}
export function parseAdminRecords(value: unknown, rpc: string) {
  return parseResponse(recordsSchema, value, rpc);
}
export function parseAdminAnalytics(value: unknown) {
  return parseResponse(analyticsSchema, value, "worksync_admin_analytics");
}
export function parseAdminDisputeContext(value: unknown) {
  return parseResponse(disputeContextSchema, value, "worksync_dispute_context");
}
