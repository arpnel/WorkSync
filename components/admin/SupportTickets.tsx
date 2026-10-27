"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { toast } from "sonner";
import { RefreshCw, Search } from "lucide-react";

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
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState("in_progress");
  const [approveCapacity, setApproveCapacity] = useState(false);
  const [newProjectLimit, setNewProjectLimit] = useState(15);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc(
      "worksync_admin_support_tickets",
      { p_status: filter === "all" ? null : filter },
    );
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Ticket[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    const request = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(request);
  }, [load]);

  const visible = rows.filter((row) =>
    `${row.subject} ${row.requester_email} ${row.category} ${row.ticket_id}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

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
      await load();
    }
    setBusy(false);
  }

  function openTicket(ticket: Ticket) {
    setSelected(ticket);
    setResponse(ticket.admin_response ?? "");
    setStatus(ticket.status === "open" ? "in_progress" : ticket.status);
    setApproveCapacity(false);
    setNewProjectLimit((ticket.current_project_limit ?? 10) + 5);
  }

  return (
    <div className="min-w-0 space-y-7">
      <AdminPageHeader title="Support tickets" />
      <AdminFilterPanel ariaLabel="Search and filter support tickets">
        <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(12rem,0.4fr)_auto]">
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            Search tickets
            <span className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                className="h-10 rounded-lg bg-background pl-10 font-normal"
                aria-label="Search support tickets"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Subject, requester, or ticket ID"
              />
            </span>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Status
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-10 rounded-lg bg-background font-normal">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {["all", ...statuses].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value === "all"
                      ? "All statuses"
                      : value.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="flex w-full flex-col gap-2 sm:col-span-2 sm:flex-row sm:justify-end xl:col-span-full">
            <Button variant="outline" className="h-10 w-full rounded-lg sm:w-auto" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
              Refresh
            </Button>
            <Button variant="ghost" className="h-10 w-full rounded-lg sm:w-auto" onClick={() => { setSearch(""); setFilter("all"); }}>
              Reset filters
            </Button>
          </div>
        </div>
      </AdminFilterPanel>
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>
            {filter === "all"
              ? "Ticket queue"
              : `${filter.replaceAll("_", " ")} tickets`}
          </CardTitle>
          <Badge variant="secondary" className="shrink-0 tabular-nums">
            {visible.length}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div
              role="status"
              aria-label="Loading tickets"
              className="space-y-3 py-2"
            >
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="space-y-3 rounded-xl border p-4 sm:p-5"
                >
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ))}
            </div>
          ) : (
            visible.map((ticket) => (
              <button
                key={ticket.ticket_id}
                type="button"
                onClick={() => openTicket(ticket)}
                className="grid w-full gap-4 rounded-xl border bg-background p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5"
              >
                <span className="min-w-0">
                  <span className="block break-words font-medium">
                    {ticket.subject}
                  </span>
                  <span className="mt-1 block break-words text-xs text-muted-foreground">
                    {ticket.category} · {ticket.requester_email} ·{" "}
                    {new Date(ticket.created_at).toLocaleString()}
                  </span>
                  <span className="mt-3 block line-clamp-2 text-sm leading-5 text-muted-foreground">
                    {ticket.description}
                  </span>
                </span>
                <Badge variant="secondary" className="w-fit capitalize">
                  {ticket.status.replaceAll("_", " ")}
                </Badge>
              </button>
            ))
          )}
          {!loading && visible.length === 0 && (
            <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
              No tickets match this view.
            </p>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.subject}</DialogTitle>
            <DialogDescription className="break-words">
              {selected?.ticket_id} · {selected?.category} ·{" "}
              {selected?.requester_email}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <p className="whitespace-pre-wrap break-words rounded-xl border bg-muted/30 p-4 text-sm leading-6">
                {selected.description}
              </p>
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
                  {busy ? "Saving…" : "Save response"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
