"use client";

import { useCallback, useEffect, useState } from "react";
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
    void load();
  }, [load]);

  const visible = rows.filter((row) =>
    `${row.subject} ${row.requester_email} ${row.category} ${row.ticket_id}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  async function save() {
    if (!selected || busy || !response.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc(
      "worksync_admin_update_support_ticket",
      {
        p_ticket: selected.ticket_id,
        p_status: status,
        p_priority: selected.priority,
        p_response: response.trim(),
      },
    );
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Ticket updated and response recorded.");
      setSelected(null);
      await load();
    }
    setBusy(false);
  }

  function openTicket(ticket: Ticket) {
    setSelected(ticket);
    setResponse(ticket.admin_response ?? "");
    setStatus(ticket.status === "open" ? "in_progress" : ticket.status);
  }

  return (
    <div className="min-w-0 space-y-7">
      <AdminPageHeader title="Support tickets" />
      <AdminFilterPanel ariaLabel="Search and filter support tickets">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.45fr)]">
          <Input
            className="h-10 rounded-lg bg-background"
            aria-label="Search support tickets"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search subject, requester, or ticket ID"
          />
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
            <p className="py-10 text-center text-sm text-muted-foreground">
              Loading tickets…
            </p>
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
