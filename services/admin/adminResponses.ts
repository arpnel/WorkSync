import { z } from "zod";

const count = z.number().finite().int().nonnegative();
const recordRows = z.array(
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
);
const recordsSchema = z
  .object({
    records: z.array(
      z.union([
        recordRows.element,
        z
          .object({
            record_type: z.literal("listing_report"),
            report: z.object({
              report_id: z.string(),
              listing_type: z.string(),
              reason: z.string(),
              status: z.string(),
              created_at: z.string().nullable(),
              owner_id: z.string().nullable(),
              description: z.string().nullish(),
              admin_notes: z.string().nullish(),
              reporter_id: z.string(),
              service_id: z.string().nullish(),
              job_id: z.string().nullish(),
            }),
          })
          .transform(({ report: r }) => ({
            id: r.report_id,
            title: r.listing_type + " report: " + r.reason,
            status: r.status,
            created_at: r.created_at ?? "",
            owner_id: r.owner_id ?? undefined,
            detail: [
              "Listing: " + (r.service_id ?? r.job_id ?? ""),
              "Reporter: " + r.reporter_id,
              r.description,
              r.admin_notes,
            ]
              .filter(Boolean)
              .join("\n"),
          })),
        z
          .object({
            record_type: z.literal("audit"),
            audit: z.object({
              audit_id: z.string(),
              action: z.string(),
              created_at: z.string().nullable(),
              admin_id: z.string().nullable(),
              target_id: z.string().nullish(),
              details: z.unknown(),
            }),
          })
          .transform(({ audit: a }) => ({
            id: a.audit_id,
            title: a.action,
            status: "recorded",
            created_at: a.created_at ?? "",
            owner_id: a.admin_id ?? undefined,
            detail: [
              "Admin: " + (a.admin_id ?? ""),
              "Target: " + (a.target_id ?? ""),
              JSON.stringify(a.details),
            ].join("\n"),
          })),
      ]),
    ),
    limit: count.positive(),
    offset: count,
    stats: z.record(count).optional(),
  })
  .refine((value) => value.records.length <= value.limit);
// The separate disputes RPC retains its checked-in rows/total contract.
const disputesSchema = z.object({ rows: recordRows, total: count });
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
export function parseAdminRecords(value: unknown, rpc: string, offset = 0) {
  if (rpc === "worksync_list_disputes") {
    const result = parseResponse(disputesSchema, value, rpc);
    return {
      rows: result.rows,
      limit: 25,
      offset,
      hasNext: offset + 25 < result.total,
    };
  }
  const result = parseResponse(recordsSchema, value, rpc);
  return {
    rows: result.records,
    limit: result.limit,
    offset: result.offset,
    hasNext: result.records.length === result.limit,
    stats: result.stats,
  };
}
export function parseAdminAnalytics(value: unknown) {
  return parseResponse(analyticsSchema, value, "worksync_admin_analytics");
}
export function parseAdminDisputeContext(value: unknown) {
  return parseResponse(disputeContextSchema, value, "worksync_dispute_context");
}
