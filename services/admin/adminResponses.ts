import { z } from "zod";
import { projectPlanSnapshotSchema } from "@/services/project/projectPlanSnapshot";

const count = z.number().finite().int().nonnegative();
const ADMIN_PAGE_SIZE = 10;
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
    total: count.optional(),
  })
  .refine((value) => value.records.length <= value.limit);
// Deployed SETOF project_disputes is serialized as an array, limited to 100.
const disputesSchema = z
  .array(
    z.object({
      dispute_id: z.string(),
      project_id: z.string(),
      status: z.string(),
      category: z.string(),
      description: z.string().nullable(),
      created_at: z.string().nullable(),
      opened_by: z.string().nullable(),
      admin_notes: z.string().nullish(),
      evidence_name: z.string().nullish(),
    }),
  )
  .max(100);
const disputePageSchema = z.object({
  rows: z.array(
    z.object({
      dispute_id: z.string(),
      project_id: z.string(),
      status: z.string(),
      category: z.string(),
      description: z.string().nullable(),
      created_at: z.string().nullable(),
      opened_by: z.string().nullable(),
      admin_notes: z.string().nullish(),
      evidence_name: z.string().nullish(),
    }),
  ),
  total: count,
  offset: count.optional(),
});
const adminJobMonitoringDetailsSchema = z.object({
  status: z.string(),
  deadline: z.string().nullable(),
  projectType: z.string().nullable(),
  experienceLevel: z.string().nullable(),
  planSnapshotsAvailable: z.boolean(),
  clientName: z.string(),
  applicants: z.array(
    z.object({
      applicationId: z.string(),
      name: z.string(),
      status: z.string(),
      proposedPrice: z.union([z.number(), z.string()]).nullable(),
      proposal: z.string().nullable(),
      estimatedDays: z.union([z.number(), z.string()]).nullable(),
      proposedPlan: projectPlanSnapshotSchema.nullable(),
      appliedAt: z.string().nullable(),
    }),
  ),
  hasMoreApplicants: z.boolean(),
});
const adminProjectDetailsSchema = z.object({
  project: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    status: z.string(),
    budget: z.union([z.number(), z.string()]).nullable(),
    projectType: z.string().nullable(),
    startDate: z.string().nullable(),
    dueDate: z.string().nullable(),
    completedAt: z.string().nullable(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
    orderId: z.string().nullable(),
    applicationId: z.string().nullable(),
  }),
  clientName: z.string(),
  freelancerName: z.string(),
  participantNamesAvailable: z.boolean(),
  contractAvailable: z.boolean(),
  milestonesAvailable: z.boolean(),
  contract: z
    .object({
      id: z.string(),
      status: z.string(),
      finalPrice: z.union([z.number(), z.string()]).nullable(),
      deliveryDays: z.number().nullable(),
      revisions: z.number().nullable(),
      createdAt: z.string().nullable(),
      updatedAt: z.string().nullable(),
      clientSignedAt: z.string().nullable(),
      freelancerSignedAt: z.string().nullable(),
      currentVersion: z.number().nullable(),
      clientSignedVersion: z.number().nullable(),
      freelancerSignedVersion: z.number().nullable(),
    })
    .nullable(),
  milestones: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      amount: z.union([z.number(), z.string()]).nullable(),
      dueDate: z.string().nullable(),
    }),
  ),
  taskProgress: z
    .object({
      total: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
      inProgress: z.number().int().nonnegative(),
      overdue: z.number().int().nonnegative(),
    })
    .nullable(),
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
  revenue: z
    .object({
      transaction_fees: z.number().finite().nonnegative(),
      premium_subscriptions: z.number().finite().nonnegative(),
      total: z.number().finite().nonnegative(),
      activity: z.array(
        z.object({
          month: z.string(),
          transaction_fees: z.number().finite().nonnegative(),
          premium_subscriptions: z.number().finite().nonnegative(),
          project_payments: count,
          premium_checkouts: count,
          total: z.number().finite().nonnegative(),
        }),
      ),
    })
    .nullable()
    .optional(),
});
const moderationAnalyticsSchema = z.object({
  from: z.string(),
  to: z.string(),
  status: z.string().nullable(),
  users: count,
  listing_reports: count,
  disputes: count,
  listing_reports_by_status: z.record(count),
  disputes_by_status: z.record(count),
  suspended_accounts: count,
  hidden_listings: count,
  audit_actions: count,
});
const compatibleAnalyticsSchema = z.union([
  analyticsSchema.transform((value) => ({
    ...value,
    revenue: value.revenue ?? null,
    scope: "platform" as const,
    moderation: null as null | {
      reports: Record<string, number>;
      disputes: Record<string, number>;
    },
  })),
  moderationAnalyticsSchema.transform((value) => ({
    scope: "moderation" as const,
    counts: {
      users: value.users,
      listing_reports: value.listing_reports,
      disputes: value.disputes,
      suspended_accounts: value.suspended_accounts,
      hidden_listings: value.hidden_listings,
      audit_actions: value.audit_actions,
    },
    completion_rate: null,
    average_project_value: null,
    average_rating: null,
    categories: null,
    activity: null,
    revenue: null,
    moderation: {
      reports: value.listing_reports_by_status,
      disputes: value.disputes_by_status,
    },
  })),
]);
export type AdminAnalyticsResult = z.infer<typeof compatibleAnalyticsSchema>;
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
  if (rpc === "worksync_list_disputes" || rpc === "worksync_admin_disputes_page") {
    const page = Array.isArray(value)
      ? null
      : parseResponse(disputePageSchema, value, rpc);
    const result = page ? page.rows : parseResponse(disputesSchema, value, rpc);
    const rows = result.map((row) => ({
      id: row.dispute_id,
      title: `${row.category} — Project ${row.project_id}`,
      status: row.status,
      created_at: row.created_at ?? "",
      owner_id: row.opened_by ?? undefined,
      detail: [row.description, row.admin_notes, row.evidence_name]
        .filter(Boolean)
        .join("\n"),
    }));
    return {
      rows: rows.slice(0, ADMIN_PAGE_SIZE),
      limit: ADMIN_PAGE_SIZE,
      offset,
      hasNext: page
        ? (page.offset ?? offset) + rows.length < page.total
        : result.length > ADMIN_PAGE_SIZE,
      total: page?.total,
    };
  }
  const result = parseResponse(recordsSchema, value, rpc);
  return {
    rows: result.records.slice(0, ADMIN_PAGE_SIZE),
    limit: ADMIN_PAGE_SIZE,
    offset: result.offset,
    hasNext: result.total != null
      ? result.offset + result.records.length < result.total
      : result.records.length > ADMIN_PAGE_SIZE ||
        (result.limit <= ADMIN_PAGE_SIZE && result.records.length === result.limit),
    stats: result.stats,
    total: result.total,
  };
}
export function parseAdminAnalytics(value: unknown) {
  return parseResponse(
    compatibleAnalyticsSchema,
    value,
    "worksync_admin_analytics",
  );
}
export function parseAdminDisputeContext(value: unknown) {
  return parseResponse(disputeContextSchema, value, "worksync_dispute_context");
}
export function parseAdminJobMonitoringDetails(value: unknown) {
  return parseResponse(
    adminJobMonitoringDetailsSchema,
    value,
    "admin_job_monitoring_details",
  );
}
export function parseAdminProjectDetails(value: unknown) {
  return parseResponse(
    adminProjectDetailsSchema,
    value,
    "admin_project_details",
  );
}
