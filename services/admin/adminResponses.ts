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
      milestone_id: z.string().nullable().optional(),
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
      milestone_id: z.string().nullable().optional(),
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
const analyticsMoney = z.number().finite();
const analyticsCountMap = z.record(count);
const adminAnalyticsSchema = z.object({
  dateRange: z.object({
    from: z.string(),
    through: z.string(),
    environment: z.enum(["all", "live", "test"]),
  }),
  earnings: z.object({
    grossTransactionFees: analyticsMoney.nonnegative(),
    grossPremiumSubscriptions: analyticsMoney.nonnegative(),
    transactionFees: analyticsMoney,
    premiumSubscriptions: analyticsMoney,
    gross: analyticsMoney.nonnegative(),
    projectFeeRefunds: analyticsMoney.nonnegative(),
    premiumRefunds: analyticsMoney.nonnegative(),
    refunds: analyticsMoney.nonnegative(),
    net: analyticsMoney,
    missingFeeSnapshots: count,
    missingPremiumTaxableSnapshots: count,
    unknownProjectFeeRefunds: count,
    partialProjectRefunds: count,
    activity: z.array(z.object({
      month: z.string(),
      transactionFees: analyticsMoney,
      premiumSubscriptions: analyticsMoney,
      refunds: analyticsMoney.nonnegative(),
      net: analyticsMoney,
    })),
  }),
  users: z.object({
    total: count,
    newlyRegistered: count,
    clients: count,
    freelancers: count,
    newClients: count,
    newFreelancers: count,
    verified: count,
    unverified: count,
    premiumSubscribers: count,
    topClients: z.array(z.object({
      userId: z.string(),
      displayName: z.string(),
      grossPaid: analyticsMoney.nonnegative(),
      paidPaymentCount: count,
    })),
    topFreelancers: z.array(z.object({
      userId: z.string(),
      displayName: z.string(),
      earningsExcludingVat: analyticsMoney.nonnegative(),
      payoutRecordCount: count,
    })),
    activity: z.array(z.object({
      month: z.string(),
      users: count,
      clients: count,
      freelancers: count,
    })),
  }),
  projects: z.object({
    created: count,
    completedInRange: count,
    active: count,
    overdue: count,
    disputed: count,
    standard: count,
    milestone: count,
    paidProjectSalesCount: count,
    unrankedPaidProjectCount: count,
    topSellingServiceCategories: z.array(z.object({
      categoryId: z.string().nullable(),
      categoryName: z.string(),
      paidProjects: count,
      projectValue: analyticsMoney.nonnegative(),
    })),
    servicesPostedCount: count,
    topPostedServiceCategories: z.array(z.object({
      categoryId: z.string().nullable(),
      categoryName: z.string(),
      listingCount: count,
    })),
    serviceActivity: z.array(z.object({
      month: z.string(),
      posted: count,
    })),
    completionRate: analyticsMoney.nullable(),
    activity: z.array(z.object({
      month: z.string(),
      created: count,
      completed: count,
    })),
  }),
  transactions: z.object({
    successful: count,
    failed: count,
    pending: count,
    other: count,
    successfulVolume: analyticsMoney.nonnegative(),
    pendingVolume: analyticsMoney.nonnegative(),
    payoutPendingCount: count,
    payoutPendingAmount: analyticsMoney.nonnegative(),
    payoutPaidCount: count,
    payoutPaidAmount: analyticsMoney.nonnegative(),
    projectPayoutBalanceAvailable: z.boolean(),
    testWithdrawalsAvailable: z.boolean(),
    testWithdrawalPendingCount: count,
    testWithdrawalPendingAmount: analyticsMoney.nonnegative(),
    testWithdrawalPaidCount: count,
    testWithdrawalPaidAmount: analyticsMoney.nonnegative(),
    refundCount: count,
    refundAmount: analyticsMoney.nonnegative(),
    statuses: analyticsCountMap,
    paymentMethods: analyticsCountMap,
    payoutStatuses: analyticsCountMap,
    activity: z.array(z.object({
      month: z.string(),
      successful: count,
      failed: count,
      pending: count,
    })),
  }),
  disputesReports: z.object({
    disputeTotal: count,
    openDisputes: count,
    resolvedDisputes: count,
    disputeResolutionRate: analyticsMoney.nullable(),
    averageDisputeResolutionHours: analyticsMoney.nonnegative().nullable(),
    disputesByStatus: analyticsCountMap,
    disputesByReason: analyticsCountMap,
    openDisputesByReason: analyticsCountMap,
    reportsTotal: count,
    reportsByStatus: analyticsCountMap,
    reportsByCategory: analyticsCountMap,
    unreviewedReportsByCategory: analyticsCountMap,
    averageReportReviewHours: analyticsMoney.nonnegative().nullable(),
  }),
});
export type AdminAnalyticsResult = z.infer<typeof adminAnalyticsSchema>;
const contractContextSchema = z.object({
  final_price: z.number().finite(),
  delivery_time_days: count,
  revisions_count: count,
  terms: z.string().nullable(),
  status: z.string(),
});
const disputeContextSchema = z.object({
  project: z.object({ title: z.string(), status: z.string() }),
  contract: contractContextSchema.nullable(),
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
});
const deployedDisputeContextSchema = z.object({
  project: z.object({
    title: z.string(),
    status: z.string(),
    client_id: z.string().nullable().optional(),
    freelancer_id: z.string().nullable().optional(),
  }),
  contract: contractContextSchema.nullable().optional(),
  dispute: z.object({
    evidence_path: z.string().nullable(),
    resolution: z.string().nullable(),
  }),
  milestone: z
    .object({
      milestone_id: z.string(),
      title: z.string(),
      status: z.string(),
    })
    .nullable(),
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
});
type DisputeContextLimitation =
  | "contract"
  | "participant_names"
  | "complete_milestone_list";
export type AdminDisputeParty = {
  role: string;
  display_name: string | null;
  user_id: string | null;
  profile_id?: string;
};
export type AdminDisputeContext = Omit<
  z.infer<typeof disputeContextSchema>,
  "parties"
> & {
  parties: AdminDisputeParty[];
  contextLimitations: DisputeContextLimitation[];
};
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
      disputeMilestoneId: row.milestone_id ?? null,
      disputeCompletionActionsAvailable: Object.prototype.hasOwnProperty.call(row, "milestone_id"),
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
  return parseResponse(adminAnalyticsSchema, value, "/api/admin/analytics");
}
export function parseAdminDisputeContext(value: unknown): AdminDisputeContext {
  const current = disputeContextSchema.safeParse(value);
  if (current.success) {
    return { ...current.data, contextLimitations: [] };
  }

  const deployed = deployedDisputeContextSchema.safeParse(value);
  if (!deployed.success) {
    throw new Error(
      "Unable to load admin data: worksync_dispute_context returned an incompatible response. Check the deployed function's response contract.",
    );
  }
  const contractIncluded =
    typeof value === "object" &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, "contract");

  const parties: AdminDisputeContext["parties"] = [];
  if (deployed.data.project.client_id) {
    parties.push({
      role: "client",
      display_name: null,
      user_id: null,
      profile_id: deployed.data.project.client_id,
    });
  }
  if (deployed.data.project.freelancer_id) {
    parties.push({
      role: "freelancer",
      display_name: null,
      user_id: null,
      profile_id: deployed.data.project.freelancer_id,
    });
  }

  return {
    project: {
      title: deployed.data.project.title,
      status: deployed.data.project.status,
    },
    contract: deployed.data.contract ?? null,
    dispute: {
      evidence_path: deployed.data.dispute.evidence_path,
      resolution: deployed.data.dispute.resolution,
    },
    parties,
    milestones: deployed.data.milestone ? [deployed.data.milestone] : [],
    submissions: deployed.data.submissions,
    contextLimitations: [
      ...(contractIncluded ? [] : ["contract"]),
      "participant_names",
      "complete_milestone_list",
    ] as DisputeContextLimitation[],
  };
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
