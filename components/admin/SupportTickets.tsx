"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { AdminStatus } from "@/components/admin/admin-ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { AdminFilterPanel } from "@/components/admin/admin-ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Check, Copy, Search, SlidersHorizontal, X } from "lucide-react";

type Ticket = {
  ticket_id: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  requester_email: string;
  admin_response: string | null;
  current_project_limit: number | null;
};

const statuses = [
  "open",
  "in_progress",
  "waiting_on_user",
  "resolved",
  "closed",
];

export default function SupportTickets() {
  const [rows, setRows] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [copiedReference, setCopiedReference] = useState(false);
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState("in_progress");
  const [approveCapacity, setApproveCapacity] = useState(false);
  const [newProjectLimit, setNewProjectLimit] = useState(15);
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [draftFromDate, setDraftFromDate] = useState("");
  const [draftToDate, setDraftToDate] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc(
      "worksync_admin_support_tickets",
      { p_status: null },
    );
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Ticket[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const request = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(request);
  }, [load]);

  const visible = rows
    .filter((row) => {
      const queryMatches = `${row.subject} ${row.description} ${row.requester_email} ${row.category} ${row.ticket_id} ${row.priority} ${row.status}`
        .toLowerCase().includes(search.trim().toLowerCase());
      const created = new Date(row.created_at).getTime();
      const statusMatches = filter === "all" || row.status === filter;
      return statusMatches && queryMatches && (!fromDate || created >= new Date(`${fromDate}T00:00:00`).getTime()) && (!toDate || created <= new Date(`${toDate}T23:59:59.999`).getTime());
    })
    .sort((a, b) => sort === "oldest" ? a.created_at.localeCompare(b.created_at) : sort === "name" ? a.subject.localeCompare(b.subject) : b.created_at.localeCompare(a.created_at));
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const visiblePage = visible.slice(page * pageSize, (page + 1) * pageSize);
  const ticketCounts = rows.reduce<Record<string, number>>((counts, ticket) => {
    counts[ticket.status] = (counts[ticket.status] ?? 0) + 1;
    return counts;
  }, {});

  async function save() {
    if (!selected || busy || !response.trim()) return;
    setBusy(true);
    const capacityDecision = selected.category === "Capacity increase" && status === "resolved";
    const { error } = capacityDecision
      ? await supabase.rpc("worksync_admin_decide_capacity_ticket", {
          p_ticket: selected.ticket_id,
          p_new_limit: approveCapacity ? newProjectLimit : null,
          p_response: response.trim(),
        })
      : await supabase.rpc("worksync_admin_update_support_ticket", {
          p_ticket: selected.ticket_id,
          p_status: status,
          p_priority: selected.priority,
          p_response: response.trim(),
        });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(
        capacityDecision
          ? approveCapacity
            ? `Capacity limit increased to ${newProjectLimit}.`
            : "Capacity request declined and response recorded."
          : "Ticket updated and response recorded.",
      );
      setSelected(null);
      setPage(0);
      await load();
    }
    setBusy(false);
  }

  function openTicket(ticket: Ticket) {
    setSelected(ticket);
    setCopiedReference(false);
    setResponse(ticket.admin_response ?? "");
    setStatus(ticket.status === "open" ? "in_progress" : ticket.status);
    setApproveCapacity(false);
    setNewProjectLimit((ticket.current_project_limit ?? 10) + 5);
  }

  return (
    <div className="min-w-0 space-y-4">
      <AdminPageHeader title="Support tickets" />
      <section aria-label="Support ticket summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total tickets", value: rows.length },
          { label: "Open", value: ticketCounts.open ?? 0 },
          { label: "In progress", value: ticketCounts.in_progress ?? 0 },
          { label: "Resolved / closed", value: (ticketCounts.resolved ?? 0) + (ticketCounts.closed ?? 0) },
        ].map((item) => (
          <Card key={item.label} className="gap-1 rounded-xl border p-3 shadow-none">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-xl font-semibold tabular-nums">{item.value.toLocaleString()}</p>
          </Card>
        ))}
      </section>
      <AdminFilterPanel ariaLabel="Search and filter support tickets">
        <div className="space-y-3">
          <div className="flex gap-2">
            <label className="relative block min-w-0 flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                className="h-10 w-full rounded-lg bg-background pl-10 font-normal"
                aria-label="Search support tickets"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(0); }}
                placeholder="Search subjects, requesters, categories, or references..."
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
                <Button type="button" variant="outline" size="icon" className="size-10 shrink-0" aria-label="Filter by created date" aria-expanded={filtersOpen}>
                  <SlidersHorizontal className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-4">
                <div className="grid gap-4">
                  <label className="grid gap-1.5 text-sm font-medium">Created from
                    <Input className="h-10 bg-background font-normal" type="date" value={draftFromDate} max={draftToDate || undefined} onChange={(event) => setDraftFromDate(event.target.value)} />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">Created to
                    <Input className="h-10 bg-background font-normal" type="date" value={draftToDate} min={draftFromDate || undefined} onChange={(event) => setDraftToDate(event.target.value)} />
                  </label>
                  <div className="flex items-center justify-between border-t pt-3">
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setDraftFromDate(""); setDraftToDate(""); }}><X className="size-4" />Clear dates</Button>
                    <Button type="button" size="sm" onClick={() => { setFromDate(draftFromDate); setToDate(draftToDate); setPage(0); setFiltersOpen(false); }}>Apply</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by ticket status">
            {["all", ...statuses].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => { setFilter(value); setPage(0); }}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${filter === value ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                {value === "all" ? "All tickets" : value.replaceAll("_", " ")}
              </button>
            ))}
          </div>
        </div>
      </AdminFilterPanel>
      <Card className="gap-0 rounded-xl border shadow-none">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <CardTitle>Support ticket records</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Requests, requester details, and response status.</p>
            <AdminStatus>{visible.length.toLocaleString()} matching</AdminStatus>
          </div>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">Sort by
            <Select value={sort} onValueChange={(value) => { setSort(value); setPage(0); }}>
              <SelectTrigger className="h-9 min-w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="name">Subject order</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </CardHeader>
        <CardContent className="overflow-x-auto p-4">
          {loading ? (
            <ContentSkeleton label="Loading support tickets" variant="admin-table" />
          ) : visible.length > 0 ? (
            <div className="rounded-lg border">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket / reference</TableHead>
                    <TableHead>Requester</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiblePage.map((ticket) => (
                    <TableRow key={ticket.ticket_id}>
                      <TableCell className="max-w-64">
                        <p className="truncate font-medium">{ticket.subject}</p>
                        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{ticket.ticket_id}</p>
                      </TableCell>
                      <TableCell className="max-w-56 truncate">{ticket.requester_email}</TableCell>
                      <TableCell>{ticket.category}</TableCell>
                      <TableCell>
                        <AdminStatus tone={ticket.priority === "urgent" || ticket.priority === "high" ? "orange" : "neutral"}>{ticket.priority}</AdminStatus>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{new Date(ticket.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <AdminStatus tone={ticket.status === "resolved" || ticket.status === "closed" ? "green" : ticket.status === "open" ? "orange" : "blue"}>
                          {ticket.status.replaceAll("_", " ")}
                        </AdminStatus>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="outline" size="sm" onClick={() => openTicket(ticket)}>View details</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="space-y-2 border-y px-4 py-12 text-center">
              <p className="font-medium">No support tickets found</p>
              <p className="text-sm text-muted-foreground">Try a different search or clear the filters.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => { setSearch(""); setFilter("all"); setFromDate(""); setToDate(""); setDraftFromDate(""); setDraftToDate(""); setPage(0); }}>Clear filters</Button>
            </div>
          )}
          {!loading && visible.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Button variant="outline" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</Button>
              <span className="text-sm text-muted-foreground">Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, visible.length)} of {visible.length} tickets</span>
              <Button variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Next</Button>
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
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-3xl">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-xl">{selected?.subject}</DialogTitle>
              {selected && <AdminStatus tone={selected.status === "resolved" || selected.status === "closed" ? "green" : selected.status === "open" ? "orange" : "blue"}>{selected.status.replaceAll("_", " ")}</AdminStatus>}
            </div>
            <DialogDescription className="break-words">
              <span className="break-all">Reference: {selected?.ticket_id}</span>
            </DialogDescription>
            {selected && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{selected.category}</span>
                <span aria-hidden="true">·</span>
                <span className="break-all">{selected.requester_email}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-7 shrink-0"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selected.ticket_id);
                      setCopiedReference(true);
                    } catch {
                      setCopiedReference(false);
                    }
                  }}
                  aria-label="Copy ticket reference"
                  title={copiedReference ? "Copied" : "Copy reference"}
                >
                  {copiedReference ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            )}
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="min-w-0 rounded-xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Requester</p>
                  <p className="mt-1 break-all font-medium">{selected.requester_email}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Category</p>
                  <p className="mt-1 font-medium">{selected.category}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Priority / created</p>
                  <p className="mt-1 font-medium capitalize">{selected.priority}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{new Date(selected.created_at).toLocaleString()}</p>
                </div>
              </div>
              <section className="rounded-xl border p-4">
                <h3 className="font-semibold">Request details</h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{selected.description}</p>
              </section>
              <label className="block space-y-1.5 text-sm font-medium">
                Status
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-10 rounded-lg bg-background font-normal">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="block space-y-1.5 text-sm font-medium">
                Response for requester
                <Textarea
                  className="font-normal"
                  value={response}
                  onChange={(event) => setResponse(event.target.value)}
                  maxLength={4000}
                  rows={6}
                  placeholder="Write a clear, helpful response"
                />
              </label>
              {selected.category === "Capacity increase" && (
                <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm font-medium">
                    Current limit: {selected.current_project_limit ?? 10} commitments
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={approveCapacity}
                      onChange={(event) => setApproveCapacity(event.target.checked)}
                    />
                    Approve a capacity increase
                  </label>
                  {approveCapacity && (
                    <label className="block space-y-1.5 text-sm font-medium">
                      New limit
                      <Input
                        type="number"
                        min={(selected.current_project_limit ?? 10) + 1}
                        max={100}
                        value={newProjectLimit}
                        onChange={(event) => setNewProjectLimit(Number(event.target.value))}
                        className="h-10 rounded-lg bg-background font-normal"
                      />
                    </label>
                  )}
                  {status === "resolved" && (
                    <p className="text-xs text-muted-foreground">
                      Saving as resolved applies this decision. Leave approval unchecked to decline the request.
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button
                  className="h-10 rounded-lg"
                  variant="outline"
                  onClick={() => setSelected(null)}
                >
                  Close
                </Button>
                <Button
                  className="h-10 rounded-lg"
                  disabled={busy || !response.trim()}
                  onClick={() => void save()}
                >
                  {busy ? "Saving..." : "Save response"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
