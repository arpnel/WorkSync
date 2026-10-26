export type PayoutHistoryItem = {
  id: string;
  transactionId: string;
  transferReference: string | null;
  status: string;
  createdAt: string;
};

export type PayoutHistoryFilters = {
  search: string;
  status: string;
  startDate: string;
  endDate: string;
  sortOrder: "newest" | "oldest";
};

export function payoutStatusGroup(status: string) {
  if (status === "ready") return "ready";
  if (status === "processing" || status === "pending") return "processing";
  if (status === "paid") return "paid";
  if (status === "failed") return "failed";
  return status;
}

export function payoutStatusLabel(status: string) {
  return ({
    ready: "Ready", processing: "Processing", pending: "Processing", paid: "Paid",
    failed: "Failed", needs_review: "Needs review", awaiting_account: "Awaiting account", cancelled: "Cancelled",
  } as Record<string, string>)[status] ?? status.replaceAll("_", " ");
}

export function payoutCreatedDay(value: string) {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Manila",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function filterPayoutHistory<T extends PayoutHistoryItem>(rows: T[], filters: PayoutHistoryFilters) {
  const needle = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    const matchesSearch = !needle || [row.id, row.transactionId, row.transferReference]
      .some((value) => value?.toLowerCase().includes(needle));
    const day = payoutCreatedDay(row.createdAt);
    return matchesSearch
      && (filters.status === "all" || payoutStatusGroup(row.status) === filters.status)
      && (!filters.startDate || day >= filters.startDate)
      && (!filters.endDate || day <= filters.endDate);
  }).sort((a, b) => filters.sortOrder === "newest"
    ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function paginatePayoutHistory<T>(rows: T[], page: number, pageSize: number) {
  return rows.slice(page * pageSize, (page + 1) * pageSize);
}
