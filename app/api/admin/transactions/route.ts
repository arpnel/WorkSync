import { randomUUID } from "node:crypto";
import { PaymentError } from "@/lib/payments/paymongo";
import {
  paymentResponse,
  paymentUser,
} from "@/services/payments/paymentServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const pageSize = 10;
const paymentFields =
  "payment_id,project_id,order_id,payer_id,amount,status,payment_method,transaction_reference,provider,livemode,currency,provider_payment_id,created_at,updated_at,paid_at,settlement_checked_at,platform_service_fee,platform_vat_amount,platform_tax_treatment,freelancer_service_vat_taxable_base,freelancer_service_vat_rate,freelancer_service_vat_amount,freelancer_service_vat_classification,freelancer_service_vat_rule";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

function readDate(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    throw new PaymentError("Choose a valid date range.", 400);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value)
    throw new PaymentError("Choose a valid date range.", 400);
  return date.toISOString();
}

function filteredPayments(
  db: Awaited<ReturnType<typeof paymentUser>>["db"],
  filters: {
    search: string;
    mode: string;
    from: string | null;
    through: string | null;
    status?: string;
    paymentIds?: string[];
    countOnly?: boolean;
  },
) {
  let query = db
    .from("payments")
    .select(
      filters.countOnly ? "payment_id" : paymentFields,
      filters.countOnly ? { count: "exact", head: true } : { count: "exact" },
    );
  if (filters.search) {
    const search = filters.search;
    query = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(
      search,
    )
      ? query.or(
          `payment_id.eq.${search},payer_id.eq.${search},transaction_reference.ilike.%${search}%,provider_payment_id.ilike.%${search}%`,
        )
      : query.or(
          `transaction_reference.ilike.%${search}%,provider_payment_id.ilike.%${search}%`,
        );
  }
  if (filters.mode !== "all")
    query = query.eq("livemode", filters.mode === "live");
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.through) query = query.lte("created_at", filters.through);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.paymentIds) {
    query = filters.paymentIds.length
      ? query.in("payment_id", filters.paymentIds)
      : query.eq("payment_id", "00000000-0000-0000-0000-000000000000");
  }
  if (!filters.countOnly)
    query = query
      .order("created_at", { ascending: false })
      .order("payment_id", { ascending: false });
  return query;
}

type PaymentDbRow = {
  payment_id: string;
  project_id: string | null;
  order_id: string | null;
  payer_id: string;
  amount: number | string;
  status: string;
  payment_method: string | null;
  transaction_reference: string | null;
  provider: string | null;
  livemode: boolean | null;
  currency: string | null;
  provider_payment_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  paid_at: string | null;
  settlement_checked_at: string | null;
  platform_service_fee: number | string | null;
  platform_vat_amount: number | string | null;
  platform_tax_treatment: string | null;
  freelancer_service_vat_taxable_base: number | string | null;
  freelancer_service_vat_rate: number | string | null;
  freelancer_service_vat_amount: number | string | null;
  freelancer_service_vat_classification: string | null;
  freelancer_service_vat_rule: string | null;
};

export async function GET(request: Request) {
  const requestId = randomUUID();
  let stage = "session_auth";
  try {
    const { db, user } = await paymentUser(request);
    stage = "admin_authorization";
    const admin = await db
      .from("admin_members")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (admin.error) {
      console.error("[admin/transactions] Admin membership query failed", {
        requestId,
        stage,
        code: admin.error.code,
        message: admin.error.message,
      });
      throw new PaymentError("Unable to verify administrator access.");
    }
    if (!admin.data)
      throw new PaymentError("Administrator access required.", 403);

    stage = "validate_filters";
    const params = new URL(request.url).searchParams;
    const rawSearch = params.get("q")?.trim() ?? "";
    if (
      rawSearch.length > 100 ||
      (rawSearch && !/^[a-z\d_-]+$/i.test(rawSearch))
    ) {
      throw new PaymentError(
        "Search using a payment ID, client ID, or provider reference.",
        400,
      );
    }
    const status = params.get("status") ?? "all";
    const mode = params.get("mode") ?? "all";
    if (!["all", "pending", "paid", "refunded", "canceled"].includes(status))
      throw new PaymentError("Choose a valid payment status.", 400);
    if (!["all", "test", "live"].includes(mode))
      throw new PaymentError("Choose a valid payment environment.", 400);

    const from = readDate(params.get("from"));
    const through = readDate(params.get("through"));
    if (from && through && from > through)
      throw new PaymentError(
        "The start date must be before the end date.",
        400,
      );
    const offsetText = params.get("offset") ?? "0";
    const offset = Number(offsetText);
    if (
      !/^\d+$/.test(offsetText) ||
      !Number.isSafeInteger(offset) ||
      offset > 100_000
    ) {
      throw new PaymentError("Invalid page offset.", 400);
    }
    const filters = { search: rawSearch, mode, from, through };

    stage = "load_payment_records";
    let statusPaymentIds: string[] | undefined;
    if (status === "refunded") {
      const { data: refundRows, error } = await db
        .from("project_refunds")
        .select("payment_id")
        .eq("status", "refunded");
      if (error) throw new PaymentError("Refunded transactions are unavailable.");
      statusPaymentIds = [...new Set((refundRows ?? []).map((row) => row.payment_id))];
    } else if (status === "canceled") {
      const { data: canceledProjects, error } = await db
        .from("projects")
        .select("project_id")
        .in("status", ["canceled", "cancelled"]);
      if (error) throw new PaymentError("Canceled transactions are unavailable.");
      const projectIds = (canceledProjects ?? []).map((row) => row.project_id);
      if (!projectIds.length) {
        statusPaymentIds = [];
      } else {
        const { data: canceledPayments, error: paymentError } = await db
          .from("payments")
          .select("payment_id")
          .in("project_id", projectIds);
        if (paymentError)
          throw new PaymentError("Canceled transactions are unavailable.");
        statusPaymentIds = (canceledPayments ?? []).map((row) => row.payment_id);
      }
    }
    const selectedStatus = ["paid", "pending"].includes(status)
      ? status
      : undefined;
    const selectedFilters = {
      ...filters,
      ...(selectedStatus ? { status: selectedStatus } : {}),
      ...(statusPaymentIds ? { paymentIds: statusPaymentIds } : {}),
    };
    const [page, total, paid, pending] = await Promise.all([
      filteredPayments(db, selectedFilters).range(offset, offset + pageSize - 1),
      filteredPayments(db, { ...selectedFilters, countOnly: true }),
      filteredPayments(db, { ...filters, status: "paid", countOnly: true }),
      filteredPayments(db, { ...filters, status: "pending", countOnly: true }),
    ]);
    if (page.error || total.error || paid.error || pending.error) {
      for (const [query, error] of [
        ["page", page.error],
        ["total", total.error],
        ["paid_count", paid.error],
        ["pending_count", pending.error],
      ] as const) {
        if (error)
          console.error("[admin/transactions] Supabase query failed", {
            requestId,
            stage,
            query,
            code: error.code,
            message: error.message,
          });
      }
      throw new PaymentError("Transactions are unavailable.");
    }

    stage = "load_related_records";
    const payments = (page.data ?? []) as unknown as PaymentDbRow[];
    const projectIds = [
      ...new Set(
        payments
          .map((row) => row.project_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const paymentIds = payments.map((row) => row.payment_id);
    const payerIds = [...new Set(payments.map((row) => row.payer_id))];
    const [
      projectsResult,
      profilesResult,
      usersResult,
      refundsResult,
      receiptsResult,
    ] = await Promise.all([
      projectIds.length
        ? db
            .from("projects")
            .select("project_id,title,status,client_id,freelancer_id,order_id")
            .in("project_id", projectIds)
        : Promise.resolve({ data: [], error: null }),
      payerIds.length
        ? db
            .from("profiles")
            .select("user_id,display_name")
            .in("user_id", payerIds)
        : Promise.resolve({ data: [], error: null }),
      payerIds.length
        ? db.from("Users").select("user_id,email").in("user_id", payerIds)
        : Promise.resolve({ data: [], error: null }),
      paymentIds.length
        ? db
            .from("project_refunds")
            .select(
              "refund_id,payment_id,amount,status,provider_refund_id,claimed_at,updated_at,refunded_at",
            )
            .in("payment_id", paymentIds)
            .order("claimed_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      paymentIds.length
        ? db
            .from("tax_transaction_receipts")
            .select("payment_id,receipt_number,issued_at")
            .in("payment_id", paymentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (
      projectsResult.error ||
      profilesResult.error ||
      usersResult.error ||
      refundsResult.error ||
      receiptsResult.error
    ) {
      for (const [query, error] of [
        ["projects", projectsResult.error],
        ["profiles", profilesResult.error],
        ["users", usersResult.error],
        ["refunds", refundsResult.error],
        ["receipts", receiptsResult.error],
      ] as const) {
        if (error)
          console.error("[admin/transactions] Supabase query failed", {
            requestId,
            stage: "load_related_records",
            query,
            code: error.code,
            message: error.message,
          });
      }
      throw new PaymentError("Transaction inspection details are unavailable.");
    }

    const projects = new Map(
      (projectsResult.data ?? []).map((row) => [row.project_id, row]),
    );
    const profileNames = new Map(
      (profilesResult.data ?? []).map((row) => [row.user_id, row.display_name]),
    );
    const userEmails = new Map(
      (usersResult.data ?? []).map((row) => [row.user_id, row.email]),
    );
    const refundsByPayment = new Map<string, typeof refundsResult.data>();
    for (const refund of refundsResult.data ?? []) {
      const rows = refundsByPayment.get(refund.payment_id) ?? [];
      rows.push(refund);
      refundsByPayment.set(refund.payment_id, rows);
    }
    const receipts = new Map(
      (receiptsResult.data ?? []).map((row) => [row.payment_id, row]),
    );

    stage = "build_response";
    return json({
      rows: payments.map((row) => {
        const project = row.project_id ? projects.get(row.project_id) : null;
        return {
          ...row,
          amount: Number(row.amount),
          platform_service_fee:
            row.platform_service_fee == null
              ? null
              : Number(row.platform_service_fee),
          platform_vat_amount:
            row.platform_vat_amount == null
              ? null
              : Number(row.platform_vat_amount),
          freelancer_service_vat_taxable_base:
            row.freelancer_service_vat_taxable_base == null
              ? null
              : Number(row.freelancer_service_vat_taxable_base),
          freelancer_service_vat_rate:
            row.freelancer_service_vat_rate == null
              ? null
              : Number(row.freelancer_service_vat_rate),
          freelancer_service_vat_amount:
            row.freelancer_service_vat_amount == null
              ? null
              : Number(row.freelancer_service_vat_amount),
          payer: {
            user_id: row.payer_id,
            display_name: profileNames.get(row.payer_id) ?? null,
            email: userEmails.get(row.payer_id) ?? null,
          },
          project: project
            ? {
                project_id: project.project_id,
                title: project.title,
                status: project.status,
                order_id: row.order_id ?? project.order_id,
                client_id: project.client_id,
                freelancer_id: project.freelancer_id,
              }
            : null,
          refunds: refundsByPayment.get(row.payment_id) ?? [],
          receipt: receipts.get(row.payment_id) ?? null,
        };
      }),
      total: total.count ?? 0,
      limit: pageSize,
      offset,
      summary: {
        total: total.count ?? 0,
        paid: paid.count ?? 0,
        pending: pending.count ?? 0,
      },
    });
  } catch (error) {
    const response = paymentResponse(error);
    const body = (await response.json()) as { error: string };
    const diagnostic =
      error instanceof PaymentError ? error.diagnostic : undefined;
    console.error("[admin/transactions] request failed", {
      requestId,
      stage,
      status: response.status,
      message: body.error,
      diagnostic,
    });
    return json({ ...body, requestId, stage, diagnostic }, response.status);
  }
}
