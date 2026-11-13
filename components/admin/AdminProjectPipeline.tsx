"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, FileText, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { AdminFilterPanel, AdminStatus } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StyledSelect } from "@/components/ui/styled-select";
import { Textarea } from "@/components/ui/textarea";
import { ProjectPlanSnapshotPreview } from "@/components/project/ProjectPlanSnapshotPreview";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AdminPagination from "@/components/admin/AdminPagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cancelAdminProjectPipelineRecord,
  getAdminProjectPipeline,
  type AdminProjectPipelineRow,
} from "@/services/admin/adminProjectPipelineService";
import { projectPlanSnapshotSchema } from "@/services/project/projectPlanSnapshot";
import type { ProjectPlanSnapshot } from "@/services/project/projectPlans";

const TERM_LABELS: Record<string, string> = {
  projectTitle: "Project title",
  category: "Category",
  categoryName: "Category",
  budget: "Agreed amount",
  startDate: "Planned start",
  deadline: "Deadline",
  deliveryDays: "Delivery period",
  revisions: "Included revisions",
  revisionsCount: "Included revisions",
  paymentTerms: "Payment terms",
};

function contractTermDetails(value: string | null | undefined) {
  if (!value?.trim())
    return {
      fields: [] as [string, string][],
      description: null as string | null,
      text: null as string | null,
    };
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const fields = Object.entries(parsed as Record<string, unknown>)
        .filter(
          ([key, item]) =>
            TERM_LABELS[key] &&
            !["budget", "deliveryDays", "revisions", "revisionsCount"].includes(
              key,
            ) &&
            ["string", "number"].includes(typeof item),
        )
        .map(
          ([key, item]) => [TERM_LABELS[key], String(item)] as [string, string],
        );
      const description = (parsed as Record<string, unknown>).description;
      return {
        fields,
        description: typeof description === "string" ? description : null,
        text: null,
      };
    }
  } catch {
    // Older agreements keep their terms as plain text.
  }
  return { fields: [] as [string, string][], description: null, text: value };
}

function formattedDate(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return new Date(value).toLocaleString();
}

function isCurrentAgreement(
  signedAt: string | null | undefined,
  signedVersion: number | null | undefined,
  currentVersion: number | null | undefined,
) {
  return Boolean(
    signedAt && (currentVersion == null || signedVersion === currentVersion),
  );
}

function money(value: number | string | null) {
  if (value == null || !Number.isFinite(Number(value))) return "Not recorded";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export default function AdminProjectPipeline() {
  const pageSize = 10;
  const [rows, setRows] = useState<AdminProjectPipelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<
    "all" | "In discussion" | "Agreement pending"
  >("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [draftFromDate, setDraftFromDate] = useState("");
  const [draftToDate, setDraftToDate] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AdminProjectPipelineRow | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [cancelMode, setCancelMode] = useState(false);
  const [planPreview, setPlanPreview] = useState<ProjectPlanSnapshot | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await getAdminProjectPipeline());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load records.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return rows
      .filter((row) => phaseFilter === "all" || row.phase === phaseFilter)
      .filter((row) => {
        if (!fromDate && !toDate) return true;
        const created = Date.parse(row.created_at ?? "");
        if (!Number.isFinite(created)) return false;
        const start = fromDate ? Date.parse(`${fromDate}T00:00:00`) : null;
        const end = toDate
          ? Date.parse(`${toDate}T00:00:00`) + 24 * 60 * 60 * 1000
          : null;
        return (start == null || created >= start) && (end == null || created < end);
      })
      .filter(
        (row) =>
          !query ||
          [
            row.title,
            row.client_name,
            row.freelancer_name,
            row.phase,
            row.status,
            row.contract_status ?? "",
            row.record_id,
          ].some((value) => value.toLocaleLowerCase().includes(query)),
      )
      .sort((a, b) => {
        const comparison =
          Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? "");
        return sort === "newest" ? -comparison : comparison;
      });
  }, [fromDate, phaseFilter, rows, search, sort, toDate]);

  useEffect(() => {
    setPage(0);
  }, [fromDate, phaseFilter, search, sort, toDate]);

  const visibleRows = filteredRows.slice(
    page * pageSize,
    (page + 1) * pageSize,
  );
  const discussionCount = rows.filter(
    (row) => row.phase === "In discussion",
  ).length;
  const agreementCount = rows.filter(
    (row) => row.phase === "Agreement pending",
  ).length;
  const selectedPlan = selected
    ? projectPlanSnapshotSchema.safeParse(selected.proposed_plan)
    : null;
  const selectedTerms = contractTermDetails(selected?.contract_terms);
  const clientAgreed = isCurrentAgreement(
    selected?.client_signed_at,
    selected?.client_signed_version,
    selected?.current_version,
  );
  const freelancerAgreed = isCurrentAgreement(
    selected?.freelancer_signed_at,
    selected?.freelancer_signed_version,
    selected?.current_version,
  );
  const hasPriorAgreement = Boolean(
    selected?.client_signed_at || selected?.freelancer_signed_at,
  );
  const agreementWaitingSince = clientAgreed
    ? selected?.client_signed_at
    : freelancerAgreed
      ? selected?.freelancer_signed_at
      : hasPriorAgreement
        ? (selected?.contract_updated_at ?? selected?.contract_created_at)
        : (selected?.contract_created_at ?? selected?.created_at);
  const agreementWaitingMessage =
    clientAgreed && freelancerAgreed
      ? "Both participants have agreed to the current terms."
      : clientAgreed
        ? `Waiting for ${selected?.freelancer_name} to agree. The client agreed on ${formattedDate(selected?.client_signed_at)}.`
        : freelancerAgreed
          ? `Waiting for ${selected?.client_name} to agree. The freelancer agreed on ${formattedDate(selected?.freelancer_signed_at)}.`
          : hasPriorAgreement
            ? "The agreement terms changed. Both participants need to confirm the current terms."
            : "Waiting for both participants to confirm the agreement.";

  async function cancel() {
    if (!selected || reason.trim().length < 1 || reason.trim().length > 500)
      return;
    setSaving(true);
    setError("");
    try {
      await cancelAdminProjectPipelineRecord(selected, reason);
      setSelected(null);
      setReason("");
      setPage(0);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Cancellation could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section
        aria-label="Discussion and contract summary"
        className="grid gap-3 sm:grid-cols-3"
      >
        {[
          { label: "Total records", value: rows.length },
          { label: "In discussion", value: discussionCount },
          { label: "Agreement pending", value: agreementCount },
        ].map((metric) => (
          <Card
            key={metric.label}
            className="gap-1 rounded-xl border p-3 shadow-none"
          >
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <p className="text-xl font-semibold tabular-nums">
              {metric.value.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">All records</p>
          </Card>
        ))}
      </section>

      <AdminFilterPanel ariaLabel="Filter discussion and contract records">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <label className="relative block min-w-0 flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
              />
              <Input
                className="h-10 w-full bg-background pl-10 font-normal"
                aria-label="Search discussions and contracts"
                placeholder="Search titles, participants, statuses, or references..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <Popover
              open={filtersOpen}
              onOpenChange={(open) => {
                if (open) {
                  setDraftFromDate(fromDate);
                  setDraftToDate(toDate);
                }
                setFiltersOpen(open);
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 shrink-0"
                >
                  <SlidersHorizontal aria-hidden="true" className="size-4" />
                  Filters
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[min(22rem,calc(100vw-2rem))] p-4"
              >
                <div className="grid gap-4">
                  <label className="grid gap-1.5 text-sm font-medium">
                    From
                    <Input
                      className="h-10 bg-background font-normal"
                      type="date"
                      value={draftFromDate}
                      max={draftToDate || undefined}
                      onChange={(event) => setDraftFromDate(event.target.value)}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    To
                    <Input
                      className="h-10 bg-background font-normal"
                      type="date"
                      value={draftToDate}
                      min={draftFromDate || undefined}
                      onChange={(event) => setDraftToDate(event.target.value)}
                    />
                  </label>
                  <div className="flex items-center justify-end gap-3 border-t pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setDraftFromDate("");
                        setDraftToDate("");
                        setFromDate("");
                        setToDate("");
                      }}
                    >
                      Clear filters
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        setFromDate(draftFromDate);
                        setToDate(draftToDate);
                        setFiltersOpen(false);
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Refresh records"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filter by phase"
          >
            {(
              [
                ["all", "All records"],
                ["In discussion", "In discussion"],
                ["Agreement pending", "Agreement pending"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={phaseFilter === value}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${phaseFilter === value ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                onClick={() => setPhaseFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Search checks work titles, participants, statuses, and references.{" "}
            {filteredRows.length} matching record
            {filteredRows.length === 1 ? "" : "s"}.
          </p>
        </div>
      </AdminFilterPanel>

      <section className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
          <div>
            <h2 className="font-semibold">
              In discussion and pending agreement
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Accepted work that has not become an active project yet.
            </p>
          </div>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
            Sort by
            <StyledSelect
              aria-label="Sort records"
              className="h-9 min-w-36 rounded-lg border bg-background px-3 text-sm text-foreground"
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as "newest" | "oldest")
              }
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </StyledSelect>
          </label>
        </header>

        {error && !selected && (
          <p
            role="alert"
            className="border-b px-5 py-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">
            Loading discussion records…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            No accepted discussions or pending contracts.
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            No records match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Work</th>
                  <th className="px-4 py-3 font-medium">Participants</th>
                  <th className="px-4 py-3 font-medium">Budget</th>
                  <th className="px-4 py-3 font-medium">Current stage</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    key={`${row.record_type}:${row.record_id}`}
                    className="border-t"
                  >
                    <td className="max-w-72 truncate px-4 py-3 font-medium">
                      {row.title}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p>Client: {row.client_name}</p>
                      <p>Freelancer: {row.freelancer_name}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {money(row.budget)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <AdminStatus tone="orange">{row.phase}</AdminStatus>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {row.created_at
                        ? new Date(row.created_at).toLocaleString()
                        : "Not recorded"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(row);
                          setReason("");
                          setCancelMode(false);
                        }}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filteredRows.length > 0 && (
          <div className="p-4">
            <AdminPagination
              page={page}
              pageSize={pageSize}
              itemCount={filteredRows.length}
              onPageChange={setPage}
              disabled={loading}
            />
          </div>
        )}

        <Dialog
          open={Boolean(selected)}
          onOpenChange={(open) => {
            if (!open && !saving) {
              setSelected(null);
              setCancelMode(false);
            }
          }}
        >
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
            <DialogHeader className="flex-row items-center gap-3 border-b bg-muted/30 px-5 py-4 pr-14 text-left sm:px-7 sm:pr-16">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileText className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-lg">
                  {cancelMode ? "Cancel accepted work" : "Work review"}
                </DialogTitle>
                <DialogDescription className="line-clamp-2">
                  {cancelMode
                    ? "Record why this discussion or pending agreement is being cancelled."
                    : `Review the scope and agreement details for ${selected?.title ?? "this work"}.`}
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {selected && !cancelMode ? (
                <article className="space-y-5 break-words p-5 text-[13px] leading-5 sm:p-6">
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">
                        {selected.title}
                      </h2>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Accepted work · created{" "}
                          {formattedDate(selected.created_at)}
                        </span>
                      </div>
                    </div>
                    <AdminStatus tone="orange">{selected.phase}</AdminStatus>
                  </header>

                  <section className="space-y-3">
                    <h3 className="font-semibold">
                      Participants and work scope
                    </h3>
                    <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Client</p>
                        <p className="mt-1 font-medium">
                          {selected.client_name}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Freelancer
                        </p>
                        <p className="mt-1 font-medium">
                          {selected.freelancer_name}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Work description
                      </p>
                      <p className="whitespace-pre-wrap">
                        {selected.work_description?.trim() ||
                          selectedTerms.description?.trim() ||
                          "No description provided."}
                      </p>
                    </div>
                    {selected.proposal?.trim() && (
                      <div className="rounded-xl border p-4">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Freelancer proposal
                        </p>
                        <p className="whitespace-pre-wrap">
                          {selected.proposal}
                        </p>
                      </div>
                    )}
                  </section>

                  {selectedPlan?.success && (
                    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                      <div className="min-w-0">
                        <h3 className="font-semibold">Proposed work plan</h3>
                        <p className="truncate text-xs text-muted-foreground">
                          {selectedPlan.data.name}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => setPlanPreview(selectedPlan.data)}
                      >
                        <Eye /> View full plan
                      </Button>
                    </section>
                  )}

                  {selected.phase === "Agreement pending" && (
                    <section className="space-y-3">
                      <h3 className="font-semibold">Agreement confirmation</h3>
                      <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
                        <p className="font-medium">{agreementWaitingMessage}</p>
                        {!(clientAgreed && freelancerAgreed) && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Waiting since {formattedDate(agreementWaitingSince)}
                          </p>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[
                          {
                            role: "Client",
                            name: selected.client_name,
                            signedAt: selected.client_signed_at,
                            agreed: clientAgreed,
                          },
                          {
                            role: "Freelancer",
                            name: selected.freelancer_name,
                            signedAt: selected.freelancer_signed_at,
                            agreed: freelancerAgreed,
                          },
                        ].map((participant) => (
                          <div
                            key={participant.role}
                            className="rounded-xl border p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  {participant.role}
                                </p>
                                <p className="mt-1 font-medium">
                                  {participant.name}
                                </p>
                              </div>
                              <AdminStatus
                                tone={participant.agreed ? "green" : "orange"}
                              >
                                {participant.agreed
                                  ? "Agreed"
                                  : participant.signedAt
                                    ? "Needs to reconfirm"
                                    : "Awaiting"}
                              </AdminStatus>
                            </div>
                            <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
                              {participant.agreed
                                ? `Agreed on ${formattedDate(participant.signedAt)}`
                                : participant.signedAt
                                  ? `Previous confirmation ${formattedDate(participant.signedAt)}`
                                  : "No confirmation recorded"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {(selected.budget != null ||
                    selectedTerms.fields.length > 0 ||
                    selectedTerms.text ||
                    (selected.milestones?.length ?? 0) > 0) && (
                    <section className="space-y-3">
                      <h3 className="font-semibold">Agreement details</h3>
                      {(selected.budget != null ||
                        selectedTerms.fields.length > 0) && (
                        <dl
                          className={`grid gap-x-6 gap-y-3 rounded-xl border bg-muted/20 p-4 ${selectedTerms.fields.length + Number(selected.budget != null) > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}
                        >
                          {selected.budget != null && (
                            <div>
                              <dt className="text-xs text-muted-foreground">
                                Proposed amount
                              </dt>
                              <dd className="mt-1 font-semibold">
                                {money(selected.budget)}
                              </dd>
                            </div>
                          )}
                          {selectedTerms.fields.map(([label, value]) => (
                            <div key={label}>
                              <dt className="text-xs text-muted-foreground">
                                {label}
                              </dt>
                              <dd className="mt-1 font-medium">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {selectedTerms.text &&
                        selectedTerms.text !== selected.work_description && (
                          <div className="rounded-xl border p-4">
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Additional terms
                            </p>
                            <p className="whitespace-pre-wrap">
                              {selectedTerms.text}
                            </p>
                          </div>
                        )}
                      {(selected.milestones?.length ?? 0) > 0 && (
                        <ol className="space-y-3">
                          {selected.milestones!.map((milestone, index) => (
                            <li
                              key={milestone.id}
                              className="flex gap-3 rounded-xl border p-4"
                            >
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                {index + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap justify-between gap-2">
                                  <h4 className="font-medium">
                                    {milestone.title}
                                  </h4>
                                  <span className="font-semibold">
                                    {money(milestone.amount)}
                                  </span>
                                </div>
                                {milestone.description && (
                                  <p className="mt-1 text-muted-foreground">
                                    {milestone.description}
                                  </p>
                                )}
                                {milestone.due_date && (
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Due {formattedDate(milestone.due_date)}
                                  </p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}
                    </section>
                  )}
                </article>
              ) : selected ? (
                <div className="space-y-4 p-5 sm:p-7">
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <p className="text-xs text-muted-foreground">Work</p>
                    <p className="mt-1 font-semibold">{selected.title}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      This action records an admin audit entry. It does not
                      issue a refund or payout.
                    </p>
                  </div>
                  <label className="grid gap-2 text-sm font-medium">
                    Cancellation reason
                    <Textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      maxLength={500}
                      rows={4}
                      placeholder="Explain why this work is being cancelled."
                    />
                  </label>
                </div>
              ) : null}
              {error && (
                <p
                  role="alert"
                  className="mx-5 mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive sm:mx-7"
                >
                  {error}
                </p>
              )}
            </div>

            <DialogFooter className="mx-0 mb-0 shrink-0 flex-wrap rounded-none border-t px-5 py-4 sm:px-6">
              {cancelMode ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCancelMode(false)}
                    disabled={saving}
                  >
                    Back to details
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void cancel()}
                    disabled={saving || !reason.trim()}
                  >
                    {saving ? "Cancelling…" : "Confirm cancellation"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelected(null)}
                    disabled={saving}
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setCancelMode(true)}
                    disabled={saving}
                  >
                    Cancel work
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <ProjectPlanSnapshotPreview
          plan={planPreview}
          open={Boolean(planPreview)}
          onOpenChange={(open) => {
            if (!open) setPlanPreview(null);
          }}
        />
      </section>
    </div>
  );
}
