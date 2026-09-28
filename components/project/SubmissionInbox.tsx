"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  MessageSquare,
  Paperclip,
  Search,
} from "lucide-react";
import type { WorkSubmission } from "@/services/project/projectDeliveryService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;
export function SubmissionInbox({
  submissions,
  milestones,
  reviewable,
  isClient,
  renderSubmission,
}: {
  submissions: WorkSubmission[];
  milestones: { id: string; title: string }[];
  reviewable: Set<string>;
  isClient: boolean;
  renderSubmission: (submission: WorkSubmission) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [oldestFirst, setOldestFirst] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleFor = (s: WorkSubmission) =>
    milestones.find((m) => m.id === s.milestone_id)?.title ??
    (s.kind === "delivery" ? "Work for approval" : "Progress update");
  const statusFor = (s: WorkSubmission) =>
    s.auto_reviewed_at
      ? "Auto-approved"
      : s.status === "approved"
        ? "Approved"
        : s.status === "revision_requested"
          ? "Changes requested"
          : reviewable.has(s.submission_id)
            ? isClient
              ? "Waiting for your review"
              : "Waiting for client"
            : s.kind === "progress"
              ? "Update"
              : "Earlier delivery";
  const sequence = new Map(
    [...submissions]
      .sort(
        (a, b) =>
          Date.parse(a.created_at) - Date.parse(b.created_at) ||
          a.submission_id.localeCompare(b.submission_id),
      )
      .map((item, index) => [item.submission_id, index + 1]),
  );
  const needle = query.trim().toLowerCase();
  const filtered = submissions
    .filter(
      (s) =>
        (filter === "all" ||
          (filter === "review"
            ? reviewable.has(s.submission_id)
            : filter === "progress"
              ? s.kind === "progress"
              : s.kind === "delivery")) &&
        (!needle ||
          [s.body, s.attachment_name, titleFor(s), statusFor(s)].some((value) =>
            value?.toLowerCase().includes(needle),
          )),
    )
    .sort(
      (a, b) =>
        (oldestFirst ? 1 : -1) *
        (Date.parse(a.created_at) - Date.parse(b.created_at) ||
          a.submission_id.localeCompare(b.submission_id)),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const selected =
    visible.find((s) => s.submission_id === selectedId) ?? visible[0];
  const resetList = () => {
    setPage(0);
    setShowDetail(false);
    setSelectedId(null);
    detailRef.current?.scrollTo(0, 0);
    listRef.current?.scrollTo(0, 0);
  };
  const turnPage = (next: number) => {
    setPage(next);
    setSelectedId(null);
    setShowDetail(false);
    listRef.current?.scrollTo(0, 0);
    detailRef.current?.scrollTo(0, 0);
  };
  return (
    <section
      className="@container min-w-0 overflow-hidden rounded-xl border"
      aria-label="Submission inbox"
    >
      <div className="space-y-3 border-b bg-muted/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            Submissions{" "}
            <span className="ml-1 font-normal text-muted-foreground">
              {submissions.length}
            </span>
          </h3>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Sort
            <select
              aria-label="Submission order"
              className="rounded-md border bg-background px-2 py-2 text-foreground"
              value={oldestFirst ? "oldest" : "newest"}
              onChange={(e) => {
                setOldestFirst(e.target.value === "oldest");
                resetList();
              }}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {isClient
            ? "Choose a submission to view the work, then approve it or ask for changes."
            : "Choose a submission to see what you sent and read your client?s feedback."}
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            aria-label="Search submissions"
            placeholder="Search notes, files, or milestones"
            className="pl-9"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              resetList();
            }}
          />
        </div>
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label="Filter submissions"
        >
          {[
            ["all", "All work"],
            ["review", isClient ? "To review" : "Awaiting review"],
            ["progress", "Progress updates"],
          ].map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={filter === value ? "outline" : "ghost"}
              className={
                filter === value
                  ? "border-primary/40 bg-primary/5 text-primary"
                  : undefined
              }
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                resetList();
              }}
            >
              {label}
              {value === "review" && reviewable.size > 0
                ? ` (${reviewable.size})`
                : ""}
            </Button>
          ))}
        </div>
      </div>
      {!filtered.length ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {submissions.length
            ? "No submissions match your search or filter."
            : isClient
              ? "No work has been submitted yet. Your freelancer?s work and updates will appear here."
              : "Ready to share your work? Use Submit work above to send files, a link, or an update."}
        </div>
      ) : (
        <div className="@min-[520px]:grid @min-[520px]:grid-cols-[190px_minmax(0,1fr)]">
          <div
            className={cn(
              "flex min-w-0 flex-col @min-[520px]:border-r",
              showDetail && "hidden @min-[520px]:flex",
            )}
          >
            <div
              ref={listRef}
              className="max-h-[480px] flex-1 overflow-y-auto overscroll-contain @min-[520px]:h-[480px]"
              aria-label="Submission list"
            >
              <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                Choose a submission
              </p>
              {visible.map((s) => (
                <button
                  key={s.submission_id}
                  type="button"
                  aria-current={
                    selected?.submission_id === s.submission_id
                      ? "true"
                      : undefined
                  }
                  onClick={() => {
                    setSelectedId(s.submission_id);
                    setShowDetail(true);
                    detailRef.current?.scrollTo(0, 0);
                    requestAnimationFrame(() => detailRef.current?.focus());
                  }}
                  className={cn(
                    "block w-full border-b border-l-2 border-l-transparent p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-offset-[-3px]",
                    selected?.submission_id === s.submission_id &&
                      "border-l-primary bg-primary/5",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {s.kind === "delivery" ? (
                      <FileCheck2 className="size-4 shrink-0 text-primary" />
                    ) : (
                      <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{titleFor(s)}</span>
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    Submission #{sequence.get(s.submission_id)}
                  </span>
                  <span className="mt-1.5 block truncate text-xs text-muted-foreground">
                    {s.body || s.attachment_name || "Shared a link"}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                    <span
                      className={cn(
                        "rounded-md bg-muted px-1.5 py-0.5",
                        reviewable.has(s.submission_id) &&
                          "bg-primary/10 text-primary",
                      )}
                    >
                      {statusFor(s)}
                    </span>
                    <time
                      dateTime={s.created_at}
                      className="text-muted-foreground"
                    >
                      {new Date(s.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "2-digit",
                      })}
                    </time>
                    {s.attachment_path && (
                      <Paperclip
                        className="size-3 text-muted-foreground"
                        aria-label="Has attachment"
                      />
                    )}
                  </span>
                  <span className="mt-2 flex items-center justify-between text-xs font-medium text-primary">
                    View work & feedback
                    <ChevronRight className="size-3.5" />
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-1 border-t bg-card p-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Previous submissions page"
                disabled={currentPage === 0}
                onClick={() => turnPage(currentPage - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span
                className="text-xs text-muted-foreground"
                aria-live="polite"
              >
                Page {currentPage + 1} of {pages}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Next submissions page"
                disabled={currentPage + 1 === pages}
                onClick={() => turnPage(currentPage + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <div
            ref={detailRef}
            tabIndex={-1}
            aria-label="Selected submission"
            className={cn(
              "min-w-0 overflow-y-auto overscroll-contain bg-card focus-visible:outline-none @min-[520px]:h-[525px]",
              !showDetail && "hidden @min-[520px]:block",
            )}
          >
            <div className="sticky top-0 z-10 border-b bg-card p-2 @min-[520px]:hidden">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowDetail(false);
                  requestAnimationFrame(() =>
                    listRef.current
                      ?.querySelector<HTMLButtonElement>(
                        '[aria-current="true"]',
                      )
                      ?.focus(),
                  );
                }}
              >
                <ArrowLeft className="size-4" />
                Back to submissions
              </Button>
            </div>
            <div className="border-b bg-muted/10 px-4 py-3">
              <h4 className="text-sm font-semibold">Work & feedback</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {selected && statusFor(selected)}
              </p>
            </div>
            <div key={selected?.submission_id} className="p-3 sm:p-4">
              {selected && renderSubmission(selected)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
