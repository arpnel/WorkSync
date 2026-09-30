"use client";
import AdminMetricCard from "./AdminMetricCard";
import AdminStatusChart from "./AdminStatusChart";
import { filterAdminPage } from "@/services/admin/adminRecordFilters";
import AdminPageHeader from "./AdminPageHeader";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import DisputeContext from "./DisputeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  getAdminRecords,
  reviewAdminRecord,
  type AdminModule,
  type AdminResult,
  type AdminRow,
} from "@/services/admin/adminService";
export default function AdminRecords({
  module,
  title,
}: {
  module: AdminModule;
  title: string;
}) {
  const [data, setData] = useState<AdminResult | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState("newest");
  const [offset, setOffset] = useState(0);
  const [previousOffsets, setPreviousOffsets] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminRow | null>(null);
  const [expires, setExpires] = useState("");
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await getAdminRecords(module, search, offset);
      if (request === sequence.current) setData(result);
    } catch (cause) {
      if (request === sequence.current) {
        setData(null);
        setError(
          cause instanceof Error ? cause.message : "Unable to load records.",
        );
      }
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [module, search, offset]);
  useEffect(() => {
    const requests = sequence;
    const timer = setTimeout(() => void load(), 200);
    return () => {
      clearTimeout(timer);
      requests.current++;
    };
  }, [load]);
  const actions =
    module === "users"
      ? ["suspend", "restore"]
      : module === "disputes"
        ? ["under_review", "resume_work", "cancel_project"]
        : module === "reports"
          ? ["under_review", "resolved", "dismissed"]
          : module === "verification"
            ? ["approved", "rejected"]
            : module === "services" || module === "jobs"
              ? ["hide", "restore"]
              : [];
  const visibleRows = filterAdminPage(
    data?.rows ?? [],
    statusFilter,
    fromDate,
    toDate,
    sort,
  );
  const statusCounts = (data?.rows ?? []).reduce<Record<string, number>>(
    (counts, row) => {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
      return counts;
    },
    {},
  );
  return (
    <div className="min-w-0 space-y-6">
      <AdminPageHeader title={title} />
      {data?.stats && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(data.stats).map(([label, value], index) => (
            <AdminMetricCard
              key={label}
              label={label}
              value={value}
              index={index}
            />
          ))}
        </div>
      )}
      {module !== "overview" && (
        <div className="relative max-w-xl">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
          />
          <Input
            className="h-10 rounded-xl bg-card pl-10"
            aria-label="Search records"
            placeholder="Search records…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
              setPreviousOffsets([]);
            }}
          />
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <label className="space-y-1 text-sm">
          Page status
          <select
            className="block h-10 rounded-md border bg-background px-3"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {Array.from(
              new Set(["all", statusFilter, ...Object.keys(statusCounts)]),
            ).map((value) => (
              <option key={value} value={value}>
                {value === "all" ? "All statuses" : value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          From
          <Input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          Through
          <Input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          Sort page
          <select
            className="block h-10 rounded-md border bg-background px-3"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A?Z</option>
          </select>
        </label>
        <Button
          variant="ghost"
          onClick={() => {
            setStatusFilter("all");
            setFromDate("");
            setToDate("");
            setSort("newest");
            setSearch("");
            setOffset(0);
            setPreviousOffsets([]);
          }}
        >
          Reset filters
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          Search checks all records. Status, dates and sorting apply to the
          loaded page.
        </p>
      </div>
      {!loading && data && (
        <AdminStatusChart
          title="Status snapshot"
          description="Status counts for the loaded page, before page filters."
          counts={statusCounts}
        />
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
          <Button variant="ghost" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}
      {feedback && (
        <p role="status" className="text-sm">
          {feedback}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {module === "overview" ? "Recent moderation activity" : "Records"}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <ContentSkeleton label="Loading records" variant="table" />
          ) : (
            <Table>
              <TableHeader className="hidden md:table-header-group">
                <TableRow>
                  <TableHead>Name / reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="grid grid-cols-2 gap-2 py-4 md:table-row md:py-0"
                  >
                    <TableCell className="col-span-2 whitespace-normal break-words font-medium md:max-w-sm">
                      {row.title}
                    </TableCell>
                    <TableCell className="capitalize">
                      <Badge
                        variant="secondary"
                        className="rounded-full font-medium"
                      >
                        {row.status.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground md:text-left md:text-sm">
                      {row.created_at
                        ? new Date(row.created_at).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="col-span-2 md:text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelected(row);
                          setExpires("");
                          setNotes("");
                          setAction(actions[0] ?? "");
                        }}
                      >
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && !error && !!data && visibleRows.length === 0 && (
            <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
              No records match this selection. Reset page filters or try another
              page.
            </p>
          )}
          {module !== "overview" && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Button
                variant="outline"
                disabled={loading || previousOffsets.length === 0}
                onClick={() => {
                  setOffset(previousOffsets[previousOffsets.length - 1] ?? 0);
                  setPreviousOffsets(previousOffsets.slice(0, -1));
                }}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {previousOffsets.length + 1}: {data?.rows.length ?? 0}{" "}
                records loaded; {visibleRows.length} shown
              </span>
              <Button
                variant="outline"
                disabled={loading || !data?.hasNext}
                onClick={() => {
                  if (!data) return;
                  setPreviousOffsets([...previousOffsets, offset]);
                  setOffset(data.offset + data.limit);
                }}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>Reference: {selected?.id}</DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words text-sm">
            {selected?.detail}
          </p>
          {module === "disputes" && selected && (
            <DisputeContext key={selected.id} id={selected.id} />
          )}
          {selected?.owner_id && (
            <Link
              className="text-sm underline"
              href={`/admin/users/${encodeURIComponent(selected.owner_id)}`}
            >
              View profile
            </Link>
          )}
          {selected?.document_paths?.map((path) => (
            <Button
              key={path}
              variant="outline"
              onClick={async () => {
                const { data, error } = await supabase.storage
                  .from("verification")
                  .createSignedUrl(path, 60);
                if (error) setError(error.message);
                else
                  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
              }}
            >
              Open {path.split("/").pop()}
            </Button>
          ))}
          {actions.length > 0 && (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!selected || busy) return;
                setBusy(true);
                setError("");
                try {
                  await reviewAdminRecord(
                    module,
                    selected.id,
                    action,
                    notes,
                    expires,
                  );
                  setSelected(null);
                  setFeedback(
                    "Action saved and recorded in the audit history.",
                  );
                  await load();
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Unable to save review.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="block text-sm">
                Action
                <select
                  className="mt-1 w-full rounded-md border bg-background p-2"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                >
                  {actions.map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              {module === "users" && action === "suspend" && (
                <label className="block text-sm">
                  Expiration (optional)
                  <Input
                    type="datetime-local"
                    value={expires}
                    onChange={(e) => setExpires(e.target.value)}
                  />
                </label>
              )}
              <label className="block text-sm">
                Reason / review notes (sent to the affected user)
                <Textarea
                  required
                  maxLength={5000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button disabled={busy || !notes.trim()}>
                {busy ? "Saving…" : "Confirm action"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
