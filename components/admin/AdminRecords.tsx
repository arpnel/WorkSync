"use client";
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
  const [page, setPage] = useState(0);
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
      const result = await getAdminRecords(module, search, page);
      if (request === sequence.current) setData(result);
    } catch (cause) {
      if (request === sequence.current)
        setError(
          cause instanceof Error ? cause.message : "Unable to load records.",
        );
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [module, search, page]);
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
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      {data?.stats && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(data.stats).map(([label, value]) => (
            <Card key={label}>
              <CardContent className="pt-4">
                <p className="text-sm capitalize text-muted-foreground">
                  {label.replaceAll("_", " ")}
                </p>
                <p className="text-2xl font-semibold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {module !== "overview" && (
        <Input
          aria-label="Search records"
          placeholder="Search records…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      )}
      {error && (
        <div role="alert" className="text-sm text-destructive">
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
              <TableHeader>
                <TableRow>
                  <TableHead>Name / reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.title}</TableCell>
                    <TableCell className="capitalize">
                      {row.status.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell>
                      {row.created_at
                        ? new Date(row.created_at).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell>
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
          {!loading && !data?.rows.length && (
            <p className="py-4 text-sm text-muted-foreground">
              No matching records.
            </p>
          )}
          {module !== "overview" && (
            <div className="mt-4 flex items-center gap-3">
              <Button
                variant="outline"
                disabled={loading || page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {page + 1} · {data?.total ?? 0} records
              </span>
              <Button
                variant="outline"
                disabled={loading || (page + 1) * 25 >= (data?.total ?? 0)}
                onClick={() => setPage(page + 1)}
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
        <DialogContent className="max-h-[85vh] overflow-y-auto">
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
              href={`/home/profile/${selected.owner_id}`}
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
                  .from("verification-documents")
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
